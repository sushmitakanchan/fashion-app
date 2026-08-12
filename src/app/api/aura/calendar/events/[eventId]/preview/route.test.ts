import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Preview route contract (spec §6 testing decisions): stub the try-on generator,
 * the Cloudinary helper, and Prisma, then assert
 *   - commit ordering — a generate/upload failure leaves `previewImageUrl` null;
 *   - the deterministic per-outfit `public_id` + overwrite/invalidate;
 *   - the `AuraTryOnError` → HTTP mapping (reusing try-on's codes);
 *   - the `wardrobe-source-invalid` re-plan path when a live-FK item is gone.
 * The ephemeral try-on route is never imported here, so it cannot be touched.
 */

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

type WardrobeItemRow = {
  id: string;
  name: string;
  deletedAt: Date | null;
  normalizedMediaId: string;
  normalizedMediaFormat: string;
};
type OutfitRow = {
  id: string;
  userId: string;
  items: { position: number | null; wardrobeItem: WardrobeItemRow }[];
  user: { auraProfile: { portraitUrl: string | null } | null };
};

type GenerateStub = (request: {
  clerkId: string;
  portraitUrl: string;
  garments: string[];
}) => Promise<string>;
type UploadStub = (
  file: string,
  folder: string,
  options: { publicId?: string; overwrite?: boolean; invalidate?: boolean },
) => Promise<{ secure_url: string }>;
type UpdateStub = (args: { where: { id: string }; data: { previewImageUrl: string } }) => Promise<unknown>;
type WardrobeGarmentStub = (id: string, format: string) => Promise<string>;

type ClerkUser = {
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
};

let live = true;
let userId: string | null = "clerk_user_1";
let clerkUser: ClerkUser | null;
let outfit: OutfitRow | null;
let findOutfit: ReturnType<typeof mock<() => Promise<OutfitRow | null>>>;
let generate: ReturnType<typeof mock<GenerateStub>>;
let upload: ReturnType<typeof mock<UploadStub>>;
let update: ReturnType<typeof mock<UpdateStub>>;
let wardrobeGarment: ReturnType<typeof mock<WardrobeGarmentStub>>;

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE:
    "AURA isn't configured to save profiles or generate portraits. Please try again later.",
  isAuraLiveConfigured: () => live,
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
  uploadImage: (
    file: string,
    folder: string,
    options: Parameters<UploadStub>[2],
  ) => upload(file, folder, options),
}));

mock.module("@/lib/wardrobe-try-on", () => ({
  wardrobeGarmentDataUri: (id: string, format: string) => wardrobeGarment(id, format),
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    plannedOutfit: {
      findFirst: () => findOutfit(),
      update: (args: Parameters<UpdateStub>[0]) => update(args),
    },
  }),
}));

const { POST } = await import("./route");

const post = (eventId = "event_1") =>
  POST(new Request(`http://localhost/api/aura/calendar/events/${eventId}/preview`, { method: "POST" }), {
    params: Promise.resolve({ eventId }),
  });

function liveItem(id: string, position: number): OutfitRow["items"][number] {
  return {
    position,
    wardrobeItem: {
      id,
      name: `Item ${id}`,
      deletedAt: null,
      normalizedMediaId: `media_${id}`,
      normalizedMediaFormat: "jpg",
    },
  };
}

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
  outfit = {
    id: "outfit_1",
    userId: "user_1",
    items: [liveItem("top_1", 0), liveItem("bottom_1", 1)],
    user: { auraProfile: { portraitUrl: "https://res.cloudinary.test/aura/portrait.jpg" } },
  };
  findOutfit = mock(async () => outfit);
  generate = mock(async () => "look-bytes");
  upload = mock(async () => ({ secure_url: "https://res.cloudinary.test/calendar-preview/outfit_1.jpg" }));
  update = mock(async () => ({}));
  wardrobeGarment = mock(async (id: string) => `data:image/jpeg;base64,wardrobe-${id}`);
});

describe("POST /api/aura/calendar/events/[eventId]/preview", () => {
  it("generates, uploads under a deterministic key, and commits previewImageUrl", async () => {
    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      previewImageUrl: "https://res.cloudinary.test/calendar-preview/outfit_1.jpg",
    });

    // Live item media, in position order, reaches the generator against the portrait.
    expect(wardrobeGarment).toHaveBeenNthCalledWith(1, "media_top_1", "jpg");
    expect(wardrobeGarment).toHaveBeenNthCalledWith(2, "media_bottom_1", "jpg");
    expect(generate).toHaveBeenCalledWith({
      clerkId: "clerk_user_1",
      portraitUrl: "https://res.cloudinary.test/aura/portrait.jpg",
      garments: [
        "data:image/jpeg;base64,wardrobe-media_top_1",
        "data:image/jpeg;base64,wardrobe-media_bottom_1",
      ],
    });

    // Deterministic per-outfit public_id in the per-user preview folder, overwrite + invalidate.
    expect(upload).toHaveBeenCalledWith(
      "data:image/jpeg;base64,look-bytes",
      "fashion-app/calendar-preview/user_1",
      { publicId: "outfit_1", overwrite: true, invalidate: true },
    );

    // The single commit point: previewImageUrl is written exactly to the upload URL.
    expect(update).toHaveBeenCalledWith({
      where: { id: "outfit_1" },
      data: { previewImageUrl: "https://res.cloudinary.test/calendar-preview/outfit_1.jpg" },
    });
  });

  it("rejects an unauthenticated caller before any work", async () => {
    userId = null;

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "unauthorized", retryable: false }),
    );
    expect(findOutfit).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses an unverified Google identity before any generation", async () => {
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
    expect(findOutfit).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses unavailable configuration before touching the outfit", async () => {
    live = false;

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "configuration-unavailable", retryable: false }),
    );
    expect(findOutfit).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports an unplanned or foreign outfit as not found", async () => {
    outfit = null;

    const response = await post();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "outfit-not-found", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports the no-portrait precondition without generating", async () => {
    outfit = { ...outfit!, user: { auraProfile: { portraitUrl: null } } };

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "no-portrait", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("takes the re-plan path when a live-FK item was soft-deleted", async () => {
    outfit = {
      ...outfit!,
      items: [
        liveItem("top_1", 0),
        {
          position: 1,
          wardrobeItem: {
            id: "gone_1",
            name: "Removed jacket",
            deletedAt: new Date("2026-08-01T00:00:00Z"),
            normalizedMediaId: "media_gone_1",
            normalizedMediaFormat: "jpg",
          },
        },
      ],
    };

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "wardrobe-source-invalid", retryable: false }),
    );
    expect(wardrobeGarment).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("takes the re-plan path when the live item set is empty", async () => {
    outfit = { ...outfit!, items: [] };

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "wardrobe-source-invalid", retryable: false }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("reports a retryable failure when wardrobe media can't be prepared", async () => {
    wardrobeGarment = mock(async () => {
      throw new Error("cloudinary unreachable");
    });

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "wardrobe-source-unavailable", retryable: true }),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a provider refusal to 422 and never writes previewImageUrl", async () => {
    generate = mock(async () => {
      throw new TryOnError("refused", false);
    });

    const response = await post();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "preview-refused", retryable: false }),
    );
    // Commit ordering: no upload, no DB write on a generation failure.
    expect(upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a provider timeout to 504", async () => {
    generate = mock(async () => {
      throw new TryOnError("timeout", true);
    });

    const response = await post();

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "preview-timeout", retryable: true }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("maps a transient provider failure to 503", async () => {
    generate = mock(async () => {
      throw new TryOnError("transient", true);
    });

    const response = await post();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "preview-temporarily-unavailable", retryable: true }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves previewImageUrl null when the upload fails (retryable save-failed)", async () => {
    upload = mock(async () => {
      throw new Error("cloudinary write failed");
    });

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "save-failed", retryable: true }),
    );
    // The commit point never ran, so no torn cache is written.
    expect(update).not.toHaveBeenCalled();
  });

  it("reports save-failed when the commit write fails after a successful upload", async () => {
    update = mock(async () => {
      throw new Error("database unavailable");
    });

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ code: "save-failed", retryable: true }),
    );
    // The asset was uploaded under the deterministic key, so a retry overwrites
    // it in place rather than orphaning a new one.
    expect(upload).toHaveBeenCalledWith(
      "data:image/jpeg;base64,look-bytes",
      "fashion-app/calendar-preview/user_1",
      { publicId: "outfit_1", overwrite: true, invalidate: true },
    );
  });
});
