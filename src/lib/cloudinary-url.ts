/**
 * On-read Cloudinary delivery transforms.
 *
 * A Saved Look stores the full Cloudinary secure URL of the generated look and
 * of each source image — no separate thumbnail asset is persisted. The Style
 * Book grid needs small, uniformly-cropped thumbnails, so it derives them *on
 * read* by inserting a delivery transformation into the stored URL rather than
 * fetching the full-resolution original.
 *
 * This is a pure string transform (no SDK, no cloud-name env) so it runs
 * identically on the server and the client and is exercisable without a
 * network. A Cloudinary delivery URL always carries a `/upload/` segment; the
 * transformation slots in directly after it:
 *
 *   .../image/upload/v123/folder/name.jpg
 *   .../image/upload/c_fill,w_600,.../v123/folder/name.jpg
 *
 * A URL without that marker (a non-Cloudinary host, or a shape we don't
 * recognise) is returned untouched — a defensive floor so a surprising stored
 * value degrades to "show the original", never to a broken URL.
 */

const UPLOAD_MARKER = "/upload/";

export type CloudinaryThumbOptions = {
  /** Target width in pixels. */
  width: number;
  /** Target height in pixels. Omit for width-only scaling. */
  height?: number;
};

/**
 * Insert a fill-crop delivery transformation into a Cloudinary secure URL.
 * `c_fill` + `g_auto` crop to the requested box around the salient subject;
 * `f_auto`/`q_auto` let Cloudinary pick the best format and quality for the
 * requesting browser; `dpr_auto` serves a sharper asset on high-density
 * displays. Returns the URL unchanged when it isn't a recognisable Cloudinary
 * delivery URL.
 */
export function cloudinaryThumbUrl(
  url: string,
  { width, height }: CloudinaryThumbOptions,
): string {
  const marker = url.indexOf(UPLOAD_MARKER);
  if (marker === -1) return url;

  const transform = [
    "c_fill",
    "g_auto",
    `w_${width}`,
    height !== undefined ? `h_${height}` : null,
    "f_auto",
    "q_auto",
    "dpr_auto",
  ]
    .filter(Boolean)
    .join(",");

  const after = marker + UPLOAD_MARKER.length;
  return `${url.slice(0, after)}${transform}/${url.slice(after)}`;
}
