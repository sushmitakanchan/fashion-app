import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * The permanent-destroy boundary used by the recovery-window expiry lifecycle.
 * Only its retry-safety contract is asserted here: an already-removed object is
 * success, a genuine failure throws so the worker retries. Cloudinary is stubbed
 * at the module seam.
 */

let destroyResult: { result: string };
let destroyArgs: { publicId: string; options: unknown } | null;

// The full module surface, so this process-wide mock never leaves another test
// file that shares the process with a missing `@/lib/cloudinary` export.
mock.module("@/lib/cloudinary", () => ({
  uploadImage: async () => {
    throw new Error("uploadImage is not stubbed for this test");
  },
  cloudinary: {
    uploader: {
      destroy: async (publicId: string, options: unknown) => {
        destroyArgs = { publicId, options };
        return destroyResult;
      },
      upload: async () => {
        throw new Error("upload is not stubbed for this test");
      },
    },
    utils: { private_download_url: () => "" },
  },
}));

const { destroyWardrobeMedia } = await import("./wardrobe-media");

beforeEach(() => {
  destroyResult = { result: "ok" };
  destroyArgs = null;
});

describe("destroyWardrobeMedia", () => {
  it("destroys the private image object and invalidates cached copies", async () => {
    await destroyWardrobeMedia("fashion-app/wardrobe/user_1/item/original");

    expect(destroyArgs?.publicId).toBe("fashion-app/wardrobe/user_1/item/original");
    expect(destroyArgs?.options).toEqual({
      resource_type: "image",
      type: "private",
      invalidate: true,
    });
  });

  it("treats an already-removed object as success", async () => {
    destroyResult = { result: "not found" };

    // Idempotent: the object being gone is exactly the state the caller wanted.
    await expect(destroyWardrobeMedia("gone")).resolves.toBeUndefined();
  });

  it("throws on any other result so the run can retry", async () => {
    destroyResult = { result: "error" };

    await expect(destroyWardrobeMedia("stuck")).rejects.toThrow(/error/);
  });
});
