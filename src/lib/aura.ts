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
 * Accepts either a `File`/`Blob` (an uploaded garment) or a data-URI `string`
 * (a link garment's already-scraped image). A data URI is fetched into a `Blob`
 * first — `fetch` resolves `data:` URIs in the browser — so both arms funnel
 * through the same canvas re-encode and come out identically sized. This is not
 * a contract change: uploads still pass a `File`, the string arm is additive.
 */
export async function downscalePhoto(
  source: Blob | string,
  maxEdge: number,
): Promise<string> {
  const blob =
    typeof source === "string" ? await (await fetch(source)).blob() : source;
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
