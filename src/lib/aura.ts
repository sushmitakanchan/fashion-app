/**
 * Helpers for the AURA profile form: unit conversion and photo encoding.
 *
 * Heights and weights are stored in metric everywhere (see `AuraProfile`), so
 * these conversions exist purely to let the form accept imperial input.
 */

/**
 * Which mode the AURA journey runs in.
 *
 * - `"live"` — Cloudinary, the database, and OpenAI image access are
 *   configured, so a submission can save (or replace) the profile.
 * - `"preview"` — one or both are absent, so the journey is a local preview:
 *   the form validates and displays a placeholder, but nothing is uploaded,
 *   persisted, or sent to any AI provider.
 *
 * Resolved server-side by `isAuraLiveConfigured()` (see `@/lib/aura-config`);
 * this type lives here so client components can accept it without importing the
 * server-only config module.
 */
export type AuraMode = "live" | "preview";

const CM_PER_INCH = 2.54;
const LB_PER_KG = 2.2046226218;

const round1 = (value: number) => Math.round(value * 10) / 10;

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function ftInToCm(feet: number, inches: number): number {
  return round1((feet * 12 + inches) * CM_PER_INCH);
}

export const kgToLb = (kg: number) => Math.round(kg * LB_PER_KG);

export const lbToKg = (lb: number) => round1(lb / LB_PER_KG);

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
