import { cloudinary } from "@/lib/cloudinary";

const SIGNED_MEDIA_TTL_SECONDS = 5 * 60;

export type SignedWardrobeMedia = {
  url: string;
  expiresAt: Date;
};

/**
 * Create an expiring delivery URL for one private wardrobe media object.
 * Callers must establish ownership before calling this helper; it intentionally
 * knows only about Cloudinary delivery, not users or database records.
 */
export function signedWardrobeMediaUrl(
  publicId: string,
  format: string,
): SignedWardrobeMedia {
  const expiresAt = new Date(Date.now() + SIGNED_MEDIA_TTL_SECONDS * 1000);

  return {
    url: cloudinary.utils.private_download_url(publicId, format, {
      resource_type: "image",
      attachment: false,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    }),
    expiresAt,
  };
}
