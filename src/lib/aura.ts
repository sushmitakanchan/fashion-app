/**
 * Photo encoding for the AURA profile form.
 */

/**
 * Downscale an image to `maxEdge` on its long side and return a JPEG data URI.
 *
 * Browser-only — needs a canvas. Phone photos run 4000px+ and several MB each;
 * sending five of those base64-encoded would exceed the request body limit long
 * before it bought any useful detail. Re-encoding to JPEG also normalises PNG
 * and WebP input to a single format for the upload.
 *
 * Accepts a `File`/`Blob` (an uploaded garment) or a data-URI `string` (a link
 * garment's already-scraped image). The string path lets both save arms —
 * upload and link — re-encode to the same edge with one helper, so a full-res
 * scraped image never ships in a save payload.
 */
export async function downscalePhoto(
  source: File | Blob | string,
  maxEdge: number,
): Promise<string> {
  const blob =
    typeof source === "string"
      ? await fetch(source).then((response) => response.blob())
      : source;
  const bitmap = await createImageBitmap(blob);

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not read the photo — canvas is unavailable.");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}
