import type { SavedLookSourceSite } from "@/lib/validations";

/**
 * A single Source as it is *stored* on a Saved Look's `sources` JSON array.
 * This is the persisted shape — the image is a Cloudinary secure URL rather
 * than the raw bytes the save request carried. Provenance is inferred, never
 * stored as a discriminator: `url`/`site` present ⇒ link, absent ⇒ upload.
 */
export type SavedLookSource = {
  imageUrl: string;
  name: string;
  url?: string;
  site?: SavedLookSourceSite;
};

/** Upper bound on a derived caption; longer captions are truncated with an ellipsis. */
export const MAX_CAPTION_LENGTH = 80;

const CAPTION_FALLBACK = "Untitled look";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Reserve one slot for the ellipsis so the result never exceeds the cap.
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Derives a Saved Look's caption from its source/garment names. A look is never
 * named by hand in v1, so this is the only naming path. One source reads as
 * itself; several read as a natural-language list ("A, B & C"). The result is
 * bounded to {@link MAX_CAPTION_LENGTH} so a pathological garment name can't
 * produce an unbounded caption.
 */
export function deriveLookCaption(sourceNames: readonly string[]): string {
  const names = sourceNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) return CAPTION_FALLBACK;

  const joined =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

  return truncate(joined, MAX_CAPTION_LENGTH);
}
