import "server-only";

import { signedWardrobeMediaUrl } from "@/lib/wardrobe-media";

const MEDIA_DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Resolve one active, already-owner-authorized wardrobe item's normalized
 * rendition into the base64 data URI the try-on generator consumes.
 *
 * Ownership and active-lifecycle admission happen at the database boundary in
 * the route handler; by the time a public id reaches this helper it is the
 * caller's own active item. Here we only sign a short-lived delivery URL for the
 * private object, fetch its bytes, and re-encode them as a data URI so a
 * wardrobe source enters generation on exactly the same provenance-free path as
 * an uploaded or scraped garment. Cloudinary delivers the object with a correct
 * `image/*` content type, which becomes the data URI's media type.
 */
export async function wardrobeGarmentDataUri(
  normalizedMediaId: string,
  normalizedMediaFormat: string,
): Promise<string> {
  const { url } = signedWardrobeMediaUrl(normalizedMediaId, normalizedMediaFormat);

  const response = await fetch(url, {
    signal: AbortSignal.timeout(MEDIA_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Wardrobe media fetch failed with status ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");
  return `data:${contentType};base64,${base64}`;
}
