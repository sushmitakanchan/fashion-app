import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

// Server-side Cloudinary SDK (for signed uploads, transformations, admin API).
// Client components should use `next-cloudinary` (<CldImage />, <CldUploadWidget />),
// which reads NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.
export type CloudinaryConfiguration = {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
};

export { cloudinary };

export function configureCloudinary({
  cloudName,
  apiKey,
  apiSecret,
}: CloudinaryConfiguration): void {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/** Read-only account connectivity probe for the healthcheck. */
export async function pingCloudinary(
  configuration: CloudinaryConfiguration,
): Promise<void> {
  configureCloudinary(configuration);
  await cloudinary.api.ping();
}

/**
 * Upload an image to Cloudinary. `file` can be a remote URL, a local path, or a
 * base64 data URI. Returns the full Cloudinary response (secure_url, public_id…).
 */
export async function uploadImage(
  file: string,
  folder = "fashion-app",
): Promise<UploadApiResponse> {
  const { env } = await import("@/lib/env");
  configureCloudinary({
    cloudName:
      env.CLOUDINARY_CLOUD_NAME ?? env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  });

  return cloudinary.uploader.upload(file, {
    folder,
    resource_type: "image",
  });
}
