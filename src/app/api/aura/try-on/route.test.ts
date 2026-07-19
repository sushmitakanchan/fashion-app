import { beforeEach, describe, expect, it, mock } from "bun:test";

type TryOnKind =
  | "refused"
  | "timeout"
  | "transient"
  | "invalid-response"
  | "invalid-garment";

class TryOnError extends Error {
  constructor(
    readonly kind: TryOnKind,
    readonly retryable: boolean,
  ) {
    super(kind);
  }
}

type Profile = { id: string; portraitUrl: string | null };
type FindUserStub = () => Promise<{ auraProfile: Profile | null } | null>;
type GenerateStub = (request: {
  clerkId: string;
  portraitUrl: string;
  garments: string[];
}) => Promise<string>;
type UploadStub = (source: string, options: unknown) => Promise<{ secure_url: string }>;
type UpdateStub = (args: unknown) => Promise<Profile>;

let live = true;
let userId: string | null = "clerk_user_1";
let clerkUser: {
  emailAddresses: {
    emailAddress: string;
    verification: { status: "verified" | "unverified" };
  }[];
  externalAccounts: {
    provider: "google" | "github";
    emailAddress: string;
    firstName: string;
    lastName: string;
    verification: { status: "verified" | "unverified" };
  }[];
} | null;
let profile: Profile | null;
let findUser: ReturnType<typeof mock<FindUserStub>>;
let generate: ReturnType<typeof mock<GenerateStub>>;
let upload: ReturnType<typeof mock<UploadStub>>;
let update: ReturnType<typeof mock<UpdateStub>>;

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE:
    "AURA isn't configured to save profiles or generate portraits. Please try again later.",
  isAuraLiveConfigured: () => live,
  isCloudinaryConfigured: () => live,
  isDatabaseConfigured: () => live,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => clerkUser,
}));

mock.module("@/lib/aura-try-on", () => ({
  AuraTryOnError: TryOnError,
  generateAuraTryOn: (request: Parameters<GenerateStub>[0]) => generate(request),
}));

mock.module("@/lib/cloudinary", () => ({
  // Not used by this route; present only so a sibling route that links it
  // can resolve against this process-wide mock.
  uploadImage: async () => {
    throw new Error("uploadImage is not stubbed for this route test");
  },
  cloudinary: {
    uploader: {
      upload: (source: string, options: unknown) => upload(source, options),
    },
  },
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: () => findUser() },
    auraProfile: { update: (args: unknown) => update(args) },
  }),
}));

const { POST } = await import("./route");

const GARMENT_IMAGE = "data:image/jpeg;base64,Z2FybWVudA==";

const post = (body: unknown = { garments: [{ image: GARMENT_IMAGE, name: "Blue linen shirt" }] }) =>
  POST(
    new Request("http://localhost/api/aura/try-on", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  live = true;
  userId = "clerk_user_1";
  clerkUser = {
    emailAddresses: [
      { emailAddress: "ada@example.com", verification: { status: "verified" } },
    ],
    externalAccounts: [
      {
        provider: "google",
        emailAddress: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        verification: { status: "verified" },
      },
    ],
  };
  profile = {
    id: "aura_1",
    portraitUrl: "https://res.cloudinary.test/aura/portrait.jpg",
  };
  findUser = mock(async () => (profile ? { auraProfile: profile } : null));
  generate = mock(async () => "look-bytes");
  upload = mock(async () => ({ secure_url: "https://res.cloudinary.test/nope.jpg" }));
  update = mock(async () => profile!);
});

describe("POST /api/aura/try-on", () => {
  it("returns an inline look and persists nothing on success", async () => {
    const response = await post({
      garments: [
        { image: GARMENT_IMAGE, name: "Blue linen shirt" },
        { image: GARMENT_IMAGE, name: "Cream trousers" },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      image: "data:image/jpeg;base64,look-bytes",
      garments: ["Blue linen shirt", "Cream trousers"],
    });
    expect(generate).toHaveBeenCalledWith({
      clerkId: "clerk_user_1",
      portraitUrl: "https://res.cloudinary.test/aura/portrait.jpg",
      garments: [GARMENT_IMAGE, GARMENT_IMAGE],
    });
    // The crucial ephemeral guarantee: no storage and no database write.
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    userId = null;

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "unauthorized", retryable: false }),
    );
    expect(findUser).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses an unverified Google email before any try-on operation", async () => {
    clerkUser = {
      ...clerkUser!,
      emailAddresses: [
        { ...clerkUser!.emailAddresses[0], verification: { status: "unverified" } },
      ],
    };

    const response = await post();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "identity-refused", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses unavailable configuration before touching the profile", async () => {
    live = false;

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "configuration-unavailable", retryable: false }),
    );
    expect(findUser).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with the validation issues", async () => {
    const response = await post({ garments: [] });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("Invalid request");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects a garment image that is not a valid data URI", async () => {
    const response = await post({
      garments: [{ image: "https://example.com/shirt.jpg", name: "Shirt" }],
    });

    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports a lookup failure as retryable", async () => {
    findUser = mock(async () => {
      throw new Error("database unavailable");
    });

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "profile-lookup-failed", retryable: true }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports a missing saved profile", async () => {
    profile = null;

    const response = await post();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "profile-not-found", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports the no-portrait precondition without calling the provider", async () => {
    profile = { id: "aura_1", portraitUrl: null };

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "no-portrait", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps an invalid garment to a non-retryable response", async () => {
    generate = mock(async () => {
      throw new TryOnError("invalid-garment", false);
    });

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "invalid-garment", retryable: false }),
    );
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a provider refusal to a non-retryable response", async () => {
    generate = mock(async () => {
      throw new TryOnError("refused", false);
    });

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "try-on-refused", retryable: false }),
    );
  });

  it("maps a provider timeout to a retryable response", async () => {
    generate = mock(async () => {
      throw new TryOnError("timeout", true);
    });

    const response = await post();

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "try-on-timeout", retryable: true }),
    );
  });

  it("maps a transient provider failure to a retryable response", async () => {
    generate = mock(async () => {
      throw new TryOnError("transient", true);
    });

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "try-on-temporarily-unavailable", retryable: true }),
    );
  });
});
