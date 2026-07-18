import { beforeEach, describe, expect, it, mock } from "bun:test";

type PortraitKind = "refused" | "timeout" | "transient" | "invalid-response";

class PortraitError extends Error {
  constructor(
    readonly kind: PortraitKind,
    readonly retryable: boolean,
  ) {
    super(kind);
  }
}

type Profile = {
  id: string;
  photoFrontUrl: string | null;
  photoCloseupUrl: string | null;
  portraitUrl: string | null;
};
type FindUserStub = () => Promise<{ auraProfile: Profile | null } | null>;
type UpdateStub = (args: {
  where: { id: string };
  data: { portraitUrl: string };
}) => Promise<Profile>;
type GenerateStub = (references: {
  clerkId: string;
  photoFrontUrl: string;
  photoCloseupUrl: string;
}) => Promise<string>;
type UploadStub = (
  source: string,
  options: { public_id: string; resource_type: string },
) => Promise<{ secure_url: string }>;

let live = true;
let userId: string | null = "clerk_user_1";
let profile: Profile | null;
let findUser: ReturnType<typeof mock<FindUserStub>>;
let update: ReturnType<typeof mock<UpdateStub>>;
let generate: ReturnType<typeof mock<GenerateStub>>;
let upload: ReturnType<typeof mock<UploadStub>>;

mock.module("@/lib/aura-config", () => ({
  isAuraLiveConfigured: () => live,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/aura-portrait", () => ({
  AuraPortraitError: PortraitError,
  generateAuraPortrait: (references: Parameters<GenerateStub>[0]) =>
    generate(references),
}));

mock.module("@/lib/cloudinary", () => ({
  cloudinary: {
    uploader: {
      upload: (source: string, options: Parameters<UploadStub>[1]) =>
        upload(source, options),
    },
  },
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: () => findUser() },
    auraProfile: { update: (args: Parameters<UpdateStub>[0]) => update(args) },
  }),
}));

const { POST } = await import("./route");

const post = () => POST();

beforeEach(() => {
  live = true;
  userId = "clerk_user_1";
  profile = {
    id: "aura_1",
    photoFrontUrl: "https://res.cloudinary.test/aura/front.jpg",
    photoCloseupUrl: "https://res.cloudinary.test/aura/closeup.jpg",
    portraitUrl: "https://res.cloudinary.test/aura/old-portrait.jpg",
  };
  findUser = mock(async () => (profile ? { auraProfile: profile } : null));
  update = mock(async ({ data }) => {
    profile = { ...profile!, portraitUrl: data.portraitUrl };
    return profile;
  });
  generate = mock(async () => "new-portrait-bytes");
  upload = mock(async () => ({
    secure_url: "https://res.cloudinary.test/aura/new-portrait.jpg",
  }));
});

describe("POST /api/aura/portrait", () => {
  it("generates from the saved required references, then stores the completed portrait", async () => {
    const response = await post();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      portraitUrl: "https://res.cloudinary.test/aura/new-portrait.jpg",
    });
    expect(generate).toHaveBeenCalledWith({
      clerkId: "clerk_user_1",
      photoFrontUrl: "https://res.cloudinary.test/aura/front.jpg",
      photoCloseupUrl: "https://res.cloudinary.test/aura/closeup.jpg",
    });
    expect(upload).toHaveBeenCalledWith(
      "data:image/jpeg;base64,new-portrait-bytes",
      expect.objectContaining({ resource_type: "image" }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: "aura_1" },
      data: { portraitUrl: "https://res.cloudinary.test/aura/new-portrait.jpg" },
    });
  });

  it("distinguishes an unavailable live configuration", async () => {
    live = false;

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "configuration-unavailable", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    userId = null;

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "unauthorized", retryable: false }),
    );
  });

  it("reports a missing saved profile", async () => {
    profile = null;

    const response = await post();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "profile-not-found", retryable: false }),
    );
  });

  it("reports missing saved portrait references without calling the provider", async () => {
    profile = { ...profile!, photoCloseupUrl: null };

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "reference-images-missing", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps a provider refusal to a non-retryable response", async () => {
    generate = mock(async () => {
      throw new PortraitError("refused", false);
    });

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "portrait-refused", retryable: false }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a provider timeout to a retryable response", async () => {
    generate = mock(async () => {
      throw new PortraitError("timeout", true);
    });

    const response = await post();

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "portrait-timeout", retryable: true }),
    );
    expect(profile?.portraitUrl).toBe("https://res.cloudinary.test/aura/old-portrait.jpg");
  });

  it("maps a transient provider failure to a retryable response", async () => {
    generate = mock(async () => {
      throw new PortraitError("transient", true);
    });

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "portrait-temporarily-unavailable", retryable: true }),
    );
  });

  it("keeps the previous portrait when image storage fails", async () => {
    upload = mock(async () => {
      throw new Error("Cloudinary unavailable");
    });

    const response = await post();

    expect(response.status).toBe(502);
    expect(profile?.portraitUrl).toBe("https://res.cloudinary.test/aura/old-portrait.jpg");
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps the previous portrait when persisting the new URL fails", async () => {
    update = mock(async () => {
      throw new Error("database unavailable");
    });

    const response = await post();

    expect(response.status).toBe(500);
    expect(profile?.portraitUrl).toBe("https://res.cloudinary.test/aura/old-portrait.jpg");
  });
});
