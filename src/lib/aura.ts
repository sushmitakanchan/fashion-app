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
 */
export async function downscalePhoto(
  file: File,
  maxEdge: number,
): Promise<string> {
  const bitmap = await createImageBitmap(file);

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
