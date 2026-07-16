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
 * Upload an image to Cloudinary. `file` can be a remote URL, a local path, or a
 * base64 data URI. Returns the full Cloudinary response (secure_url, public_id…).
 */
export async function uploadImage(
  file: string,
  folder = "fashion-app",
): Promise<UploadApiResponse> {
  return cloudinary.uploader.upload(file, {
    folder,
    resource_type: "image",
  });
}
