import { cn } from "@/lib/utils";
import type { BodyType } from "@/lib/validations";

/**
 * Schematic body-shape silhouettes for the AURA body type picker.
 *
 * The five figures are generated from one path template so they stay
 * comparable — only the shoulder/waist/hip half-widths change between them,
 * which is exactly the distinction a user is being asked to make. Drawn inline
 * (rather than shipped as assets) so the picker works offline and inherits the
 * current text colour in both themes.
 *
 * The widths make the selected body type easy to compare at small sizes.
 */

type Proportions = {
  /** Half-widths in viewBox units, measured from the centre line. */
  shoulder: number;
  waist: number;
  hip: number;
};

/** Ratios are normalised around 1; this is the half-width that maps to 1. */
const BASE_HALF_WIDTH = 15;

const BODY_TYPE_RATIOS: Record<
  BodyType,
  { shoulder: number; waist: number; hip: number }
> = {
  RECTANGLE: { shoulder: 1, waist: 0.867, hip: 1 },
  TRIANGLE: { shoulder: 0.867, waist: 0.867, hip: 1.333 },
  INVERTED_TRIANGLE: { shoulder: 1.333, waist: 0.867, hip: 0.867 },
  HOURGLASS: { shoulder: 1.2, waist: 0.633, hip: 1.2 },
  OVAL: { shoulder: 1, waist: 1.267, hip: 1 },
};

function proportionsFor(bodyType: BodyType): Proportions {
  const ratio = BODY_TYPE_RATIOS[bodyType];
  return {
    shoulder: ratio.shoulder * BASE_HALF_WIDTH,
    waist: ratio.waist * BASE_HALF_WIDTH,
    hip: ratio.hip * BASE_HALF_WIDTH,
  };
}

export const BODY_TYPE_LABELS: Record<
  BodyType,
  { label: string; description: string }
> = {
  RECTANGLE: {
    label: "Rectangle",
    description: "Shoulders, waist and hips roughly in line",
  },
  TRIANGLE: {
    label: "Triangle",
    description: "Hips wider than shoulders",
  },
  INVERTED_TRIANGLE: {
    label: "Inverted triangle",
    description: "Shoulders wider than hips",
  },
  HOURGLASS: {
    label: "Hourglass",
    description: "Balanced shoulders and hips, defined waist",
  },
  OVAL: {
    label: "Oval",
    description: "Fuller through the midsection",
  },
};

const CENTRE = 32;
const NECK = 4.5;

// Traced clockwise from the left of the neck. The path closes across the top of
// the neck, which the head circle overlaps, so the two shapes read as one body.
function bodyPath({ shoulder: s, waist: w, hip: h }: Proportions) {
  const n = (value: number) => value.toFixed(1);

  return [
    `M ${n(CENTRE - NECK)} 16`,
    // Shoulder slope out to the tip, then down the torso to the waist and hip.
    `C ${n(CENTRE - NECK)} 22 ${n(CENTRE - s)} 21 ${n(CENTRE - s)} 26`,
    `C ${n(CENTRE - s)} 36 ${n(CENTRE - w)} 41 ${n(CENTRE - w)} 50`,
    `C ${n(CENTRE - w)} 58 ${n(CENTRE - h)} 58 ${n(CENTRE - h)} 66`,
    // Left leg down to the foot, across, and back up to the crotch.
    `L ${n(CENTRE - h * 0.72)} 96`,
    `L ${n(CENTRE - h * 0.26)} 96`,
    `L ${n(CENTRE)} 72`,
    // Right side mirrors it, back up to the neck.
    `L ${n(CENTRE + h * 0.26)} 96`,
    `L ${n(CENTRE + h * 0.72)} 96`,
    `L ${n(CENTRE + h)} 66`,
    `C ${n(CENTRE + h)} 58 ${n(CENTRE + w)} 58 ${n(CENTRE + w)} 50`,
    `C ${n(CENTRE + w)} 41 ${n(CENTRE + s)} 36 ${n(CENTRE + s)} 26`,
    `C ${n(CENTRE + s)} 21 ${n(CENTRE + NECK)} 22 ${n(CENTRE + NECK)} 16`,
    "Z",
  ].join(" ");
}

export function BodyTypeFigure({
  bodyType,
  className,
}: {
  bodyType: BodyType;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 100"
      className={cn("h-20 w-auto", className)}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={CENTRE} cy="11" r="7.5" />
      <path d={bodyPath(proportionsFor(bodyType))} />
    </svg>
  );
}
