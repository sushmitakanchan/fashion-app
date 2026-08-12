import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Server-side Cloudinary SDK (for signed uploads, transformations, admin API).
// Client components should use `next-cloudinary` (<CldImage />, <CldUploadWidget />),
// which reads NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.
cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export { cloudinary };

/**
 * Optional, additive upload controls. Omit them for the historical behaviour
 * (Cloudinary assigns a random `public_id`, no overwrite). A deterministic
 * `publicId` — one fixed asset per logical thing, e.g. one preview per outfit —
 * combined with `overwrite`/`invalidate` lets a regeneration replace the asset
 * in place rather than accumulating orphans.
 */
export type UploadImageOptions = {
  /** Fixed public id (within `folder`) for an overwrite-in-place asset. */
  publicId?: string;
  /** Overwrite any existing asset at the same public id. */
  overwrite?: boolean;
  /** Invalidate the CDN copy on overwrite so the new bytes serve immediately. */
  invalidate?: boolean;
};

/**
 * Upload an image to Cloudinary. `file` can be a remote URL, a local path, or a
 * base64 data URI. Returns the full Cloudinary response (secure_url, public_id…).
 *
 * `options` is purely additive: existing two-argument callers keep the random,
 * insert-only behaviour untouched.
 */
export async function uploadImage(
  file: string,
  folder = "fashion-app",
  options: UploadImageOptions = {},
): Promise<UploadApiResponse> {
  return cloudinary.uploader.upload(file, {
    folder,
    resource_type: "image",
    ...(options.publicId !== undefined ? { public_id: options.publicId } : {}),
    ...(options.overwrite !== undefined ? { overwrite: options.overwrite } : {}),
    ...(options.invalidate !== undefined ? { invalidate: options.invalidate } : {}),
  });
}
