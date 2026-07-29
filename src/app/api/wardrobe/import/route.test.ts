import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for wardrobe batch import. The seam under test is
 * `POST /api/wardrobe/import`: Clerk, Cloudinary ingestion, and the active-item
 * count are stubbed at the module boundary so every branch — unauthorized,
 * unconfigured, over-limit, per-item validation/upload failure, and a mixed
 * success batch — is observable in the response.
 *
 * `mock.module` patches the registry for the whole process, so no file that
 * needs the real `@/lib/wardrobe-media`, `@/lib/prisma`, `@/lib/aura-config`, or
 * Clerk may share a process with this one.
 */

const PNG = "data:image/png;base64,AAAA";
const TOO_MANY = Array.from({ length: 21 }, (_, i) => ({
  clientId: `c${i}`,
  dataUri: PNG,
}));

let userId: string | null = "clerk_user_1";
let live = true;
let activeCount = 0;
let uploadThrowsFor: string | null = null; // matches on the data URI

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isCloudinaryConfigured: () => live,
  isDatabaseConfigured: () => live,
}));

let countedWhere: unknown = null;
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    wardrobeItem: {
      count: async ({ where }: { where: unknown }) => {
        countedWhere = where;
        return activeCount;
      },
    },
  }),
}));

const uploadCalls: string[] = [];
mock.module("@/lib/wardrobe-media", () => ({
  // `mock.module` patches the registry process-wide, so also surface the module's
  // other export as a harmless stub — otherwise, if this file shares a process
  // with the media-route test, it would shadow `signedWardrobeMediaUrl` and break
  // that handler's import.
  signedWardrobeMediaUrl: (publicId: string, format: string) => ({
    url: `https://media.example.test/${publicId}.${format}`,
    expiresAt: new Date("2026-07-29T12:05:00Z"),
  }),
  uploadWardrobeMedia: async (dataUri: string, ownerKey: string) => {
    uploadCalls.push(ownerKey);
    if (uploadThrowsFor && dataUri === uploadThrowsFor) {
      throw new Error("cloudinary exploded");
    }
    const seed = String(uploadCalls.length);
    return {
      original: {
        mediaId: `fashion-app/wardrobe/${ownerKey}/${seed}/original`,
        format: "png",
      },
      normalized: {
        mediaId: `fashion-app/wardrobe/${ownerKey}/${seed}/normalized`,
        format: "webp",
      },
    };
  },
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/wardrobe/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  activeCount = 0;
  uploadThrowsFor = null;
  countedWhere = null;
  uploadCalls.length = 0;
});

describe("POST /api/wardrobe/import", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    const response = await post({ images: [{ clientId: "c0", dataUri: PNG }] });
    expect(response.status).toBe(401);
  });

  it("reports the batch as unavailable when storage is not configured", async () => {
    live = false;
    const response = await post({ images: [{ clientId: "c0", dataUri: PNG }] });
    expect(response.status).toBe(503);
    expect(uploadCalls).toHaveLength(0);
  });

  it("rejects an empty batch and a batch over the 20-image limit", async () => {
    expect((await post({ images: [] })).status).toBe(400);
    expect((await post({ images: TOO_MANY })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect(uploadCalls).toHaveLength(0);
  });

  it("rejects a batch that would exceed the 200 active-item limit", async () => {
    activeCount = 199;
    const response = await post({
      images: [
        { clientId: "c0", dataUri: PNG },
        { clientId: "c1", dataUri: PNG },
      ],
    });

    expect(response.status).toBe(409);
    expect(uploadCalls).toHaveLength(0);
    expect(countedWhere).toMatchObject({
      user: { clerkId: "clerk_user_1" },
      deletedAt: null,
    });
  });

  it("ingests each supported image into two private renditions", async () => {
    const response = await post({
      images: [
        { clientId: "c0", dataUri: PNG },
        { clientId: "c1", dataUri: PNG },
      ],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(uploadCalls).toEqual(["clerk_user_1", "clerk_user_1"]);
    expect(body.items).toEqual([
      {
        clientId: "c0",
        status: "ready",
        media: {
          originalMediaId: "fashion-app/wardrobe/clerk_user_1/1/original",
          originalMediaFormat: "png",
          normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/1/normalized",
          normalizedMediaFormat: "webp",
        },
      },
      {
        clientId: "c1",
        status: "ready",
        media: {
          originalMediaId: "fashion-app/wardrobe/clerk_user_1/2/original",
          originalMediaFormat: "png",
          normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/2/normalized",
          normalizedMediaFormat: "webp",
        },
      },
    ]);
  });

  it("reports an unsupported image as a per-item failure without failing the batch", async () => {
    const response = await post({
      images: [
        { clientId: "good", dataUri: PNG },
        { clientId: "bad", dataUri: "data:text/plain;base64,AAAA" },
      ],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({ clientId: "good", status: "ready" });
    expect(body.items[1]).toMatchObject({ clientId: "bad", status: "failed" });
    expect(typeof body.items[1].reason).toBe("string");
    // The good image still uploaded; the bad one never reached Cloudinary.
    expect(uploadCalls).toHaveLength(1);
  });

  it("reports an upload error as a per-item failure", async () => {
    uploadThrowsFor = PNG;
    const response = await post({
      images: [{ clientId: "c0", dataUri: PNG }],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({ clientId: "c0", status: "failed" });
  });
});
