import { beforeEach, describe, expect, it, mock } from "bun:test";

let userId: string | null = "clerk_user_1";
let requestedOwner: string | null = null;
let signedFor: string | null = null;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    wardrobeItem: {
      findFirst: async ({ where }: { where: { id: string; user: { clerkId: string }; deletedAt?: null } }) => {
        requestedOwner = where.user.clerkId;
        // This owner-owned row is recoverably deleted. It must only be visible
        // when the handler *fails* to constrain the lookup to active items.
        if (where.id === "deleted_item" && where.user.clerkId === "clerk_user_1") {
          if (where.deletedAt === null) return null;
          return {
            originalMediaId: "fashion-app/wardrobe/user_1/deleted_item/original",
            originalMediaFormat: "jpg",
            normalizedMediaId: "fashion-app/wardrobe/user_1/deleted_item/normalized",
            normalizedMediaFormat: "webp",
          };
        }
        if (where.id !== "item_1" || where.user.clerkId !== "clerk_user_1") return null;
        return {
          originalMediaId: "fashion-app/wardrobe/user_1/item_1/original",
          originalMediaFormat: "jpg",
          normalizedMediaId: "fashion-app/wardrobe/user_1/item_1/normalized",
          normalizedMediaFormat: "webp",
        };
      },
    },
  }),
}));

mock.module("@/lib/wardrobe-media", () => ({
  signedWardrobeMediaUrl: (publicId: string, format: string) => {
    signedFor = `${publicId}.${format}`;
    return {
      url: `https://media.example.test/${publicId}.${format}?signature=short-lived`,
      expiresAt: new Date("2026-07-29T12:05:00Z"),
    };
  },
  // `mock.module` patches the registry process-wide; surface the module's other
  // export too so this file can't shadow `uploadWardrobeMedia` for the import
  // route if they share a process.
  uploadWardrobeMedia: async () => ({
    original: { mediaId: "unused", format: "png" },
    normalized: { mediaId: "unused", format: "webp" },
  }),
}));

const { GET } = await import("./route");

const get = (itemId = "item_1", variant = "normalized") =>
  GET(
    new Request(`http://localhost/api/wardrobe/${itemId}/media?variant=${variant}`),
    { params: Promise.resolve({ itemId }) },
  );

beforeEach(() => {
  userId = "clerk_user_1";
  requestedOwner = null;
  signedFor = null;
});

describe("GET /api/wardrobe/[itemId]/media", () => {
  it("returns a short-lived signed URL only for the authenticated owner", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://media.example.test/fashion-app/wardrobe/user_1/item_1/normalized.webp?signature=short-lived",
      expiresAt: "2026-07-29T12:05:00.000Z",
    });
    expect(requestedOwner).toBe("clerk_user_1");
    expect(signedFor).toBe("fashion-app/wardrobe/user_1/item_1/normalized.webp");
  });

  it("does not disclose an item's media to another authenticated participant", async () => {
    userId = "clerk_user_2";

    const response = await get();

    expect(response.status).toBe(404);
    expect(signedFor).toBeNull();
  });

  it("does not disclose media for a recoverably deleted item", async () => {
    const response = await get("deleted_item");

    expect(response.status).toBe(404);
    expect(signedFor).toBeNull();
  });

  it("supports the private original rendition and rejects invalid variants", async () => {
    const original = await get("item_1", "original");
    expect(original.status).toBe(200);
    expect(signedFor).toBe("fashion-app/wardrobe/user_1/item_1/original.jpg");

    const invalid = await get("item_1", "preview");
    expect(invalid.status).toBe(400);
  });
});
