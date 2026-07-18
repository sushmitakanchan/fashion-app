/**
 * Helpers for the AURA digital-twin form: unit conversion, photo encoding, and
 * turning measurements into the proportions the 3D twin is built from.
 *
 * Heights and weights are stored in metric everywhere (see `AuraProfile`), so
 * these conversions exist purely to let the form accept imperial input.
 */

import type { BodyType, Gender } from "@/lib/validations";

/**
 * Which mode the AURA journey runs in.
 *
 * - `"live"` — Cloudinary and the database are configured, so a submission
 *   uploads the five reference photos and persists (or replaces) the profile.
 * - `"preview"` — one or both are absent, so the journey is a local preview:
 *   the form still validates and derives a twin, but nothing is uploaded,
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function ftInToCm(feet: number, inches: number): number {
  return round1((feet * 12 + inches) * CM_PER_INCH);
}

export const kgToLb = (kg: number) => Math.round(kg * LB_PER_KG);

export const lbToKg = (lb: number) => round1(lb / LB_PER_KG);

/* -------------------------------------------------------------------------- */
/*                             Body proportions                               */
/* -------------------------------------------------------------------------- */

/**
 * Shoulder / waist / hip widths per body shape, normalised around 1.
 *
 * Shared by the 2D silhouette picker and the 3D twin, so the shape someone
 * selects and the body they get can't drift apart.
 */
export const BODY_SHAPE_RATIOS: Record<
  BodyType,
  { shoulder: number; waist: number; hip: number }
> = {
  RECTANGLE: { shoulder: 1, waist: 0.867, hip: 1 },
  TRIANGLE: { shoulder: 0.867, waist: 0.867, hip: 1.333 },
  INVERTED_TRIANGLE: { shoulder: 1.333, waist: 0.867, hip: 0.867 },
  HOURGLASS: { shoulder: 1.2, waist: 0.633, hip: 1.2 },
  OVAL: { shoulder: 1, waist: 1.267, hip: 1 },
};

/** Baseline dimorphism, applied on top of the body shape. */
const GENDER_SHAPE: Record<
  Gender,
  { shoulder: number; hip: number; bust: number }
> = {
  MALE: { shoulder: 1.08, hip: 0.93, bust: 0 },
  FEMALE: { shoulder: 0.94, hip: 1.07, bust: 0.12 },
  UNDISCLOSED: { shoulder: 1, hip: 1, bust: 0.05 },
};

/**
 * The silhouette icons exaggerate their ratios so five shapes stay legible at
 * 80px. A body rendered at true scale doesn't need that help — 1.33x shoulders
 * on a real figure reads as a costume — so the ratios are pulled back toward
 * neutral before they drive the mesh.
 */
const soften = (ratio: number) => 1 + (ratio - 1) * 0.55;

// Radii as fractions of stature, tuned so a neutral build lands on real
// population averages. Enough to read as a correctly proportioned body, not a
// tailoring-grade measurement.
const STATURE = {
  neck: 0.033,
  shoulder: 0.115,
  chest: 0.093,
  waist: 0.084,
  hip: 0.102,
  thigh: 0.056,
  calf: 0.038,
  upperArm: 0.031,
  forearm: 0.024,
  // Sized so the head, once scaled to an ellipsoid, spans chin to crown.
  head: 0.058,
};

export type BodyMeasurements = {
  heightCm: number;
  weightKg: number;
  gender: Gender;
  bodyType: BodyType;
};

/** Everything the twin mesh needs, in metres. */
export type BodyParams = {
  height: number;
  neck: number;
  shoulder: number;
  chest: number;
  waist: number;
  hip: number;
  thigh: number;
  calf: number;
  upperArm: number;
  forearm: number;
  headRadius: number;
  /** Extra chest radius, as a fraction, for the bust. */
  bust: number;
  /** Bodies are wider than deep; the torso is squashed on Z by this. */
  depth: number;
};

export function deriveBodyParams({
  heightCm,
  weightKg,
  gender,
  bodyType,
}: BodyMeasurements): BodyParams {
  const height = heightCm / 100;
  const shape = BODY_SHAPE_RATIOS[bodyType];
  const sex = GENDER_SHAPE[gender];

  // At a fixed height, mass scales with cross-sectional area, and radius with
  // the square root of area — so girth goes with sqrt(BMI). 22 is the reference
  // build the ratios above are tuned against.
  const bmi = clamp(weightKg / (height * height), 13, 45);
  const girth = clamp(Math.sqrt(bmi / 22), 0.78, 1.5);

  // Limbs take a softer share of a weight change than the torso does.
  const limbGirth = 1 + (girth - 1) * 0.72;

  const shoulderRatio = soften(shape.shoulder);
  const waistRatio = soften(shape.waist);
  const hipRatio = soften(shape.hip);
  // The chest sits between the shoulder and waist, so it tracks both.
  const chestRatio = shoulderRatio * 0.6 + waistRatio * 0.4;

  return {
    height,
    neck: height * STATURE.neck * limbGirth,
    shoulder: height * STATURE.shoulder * shoulderRatio * sex.shoulder * girth,
    chest: height * STATURE.chest * chestRatio * girth,
    waist: height * STATURE.waist * waistRatio * girth,
    hip: height * STATURE.hip * hipRatio * sex.hip * girth,
    thigh: height * STATURE.thigh * hipRatio * limbGirth,
    calf: height * STATURE.calf * limbGirth,
    upperArm: height * STATURE.upperArm * limbGirth,
    forearm: height * STATURE.forearm * limbGirth,
    headRadius: height * STATURE.head,
    bust: sex.bust,
    // Heavier builds are proportionally deeper, not just wider.
    depth: clamp(0.72 + (girth - 1) * 0.4, 0.62, 0.95),
  };
}

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
