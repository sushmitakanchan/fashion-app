import { cloudinary } from "@/lib/cloudinary";
import { wardrobeMediaFolder } from "@/lib/wardrobe";

const SIGNED_MEDIA_TTL_SECONDS = 5 * 60;

// The longest edge of the normalized working rendition. Large enough to stay
// crisp in the wardrobe grid and Try On, small enough to keep private delivery
// cheap; the original upload is retained untouched alongside it.
const NORMALIZED_MAX_EDGE = 1600;

export type WardrobeMediaRendition = {
  mediaId: string;
  format: string;
};

/** The two private renditions one imported image produces. */
export type WardrobeMediaPair = {
  original: WardrobeMediaRendition;
  normalized: WardrobeMediaRendition;
};

/**
 * Ingest one imported image into a participant's private wardrobe folder as two
 * separate private Cloudinary objects: the untouched original and a size- and
 * format-normalized working rendition. Both are uploaded as `type: "private"`,
 * so they are reachable only through the owner-authorized, expiring URLs
 * {@link signedWardrobeMediaUrl} mints — never a durable public asset URL.
 *
 * The caller must have already authorized the owner; `ownerKey` (the Clerk id)
 * only scopes the storage folder, which in turn encodes ownership for the save
 * boundary to re-check.
 */
export async function uploadWardrobeMedia(
  dataUri: string,
  ownerKey: string,
): Promise<WardrobeMediaPair> {
  const folder = wardrobeMediaFolder(ownerKey);

  const [original, normalized] = await Promise.all([
    cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      type: "private",
    }),
    cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      type: "private",
      // Applied at ingest, so the stored asset *is* the normalized rendition —
      // a consistent working image every saved item shares.
      transformation: [
        { width: NORMALIZED_MAX_EDGE, height: NORMALIZED_MAX_EDGE, crop: "limit" },
      ],
      format: "webp",
    }),
  ]);

  return {
    original: { mediaId: original.public_id, format: original.format },
    normalized: { mediaId: normalized.public_id, format: normalized.format },
  };
}

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
