/**
 * Deterministic garment-colour recommendation from a skin-tone RGB sample.
 *
 * This is pure colour science: no AI, no network, no randomness. Given the RGB
 * of a person's skin it classifies undertone/depth and derives garment palettes
 * as harmonies of the skin's hue on the colour wheel (complementary, split-
 * complementary, triadic, analogous), plus a set of flattering neutrals and a
 * short "avoid" list. Same input always yields the same output, so it can be
 * unit-tested and rendered on the client without a server round-trip.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

export interface Swatch {
  hex: string;
  name: string;
}

export interface Palette {
  key: string;
  title: string;
  rationale: string;
  colors: Swatch[];
}

export type Undertone = "warm" | "cool" | "neutral";
export type Depth = "light" | "medium" | "deep";

export interface ColorAnalysis {
  skin: { hex: string; rgb: RGB; hsl: HSL };
  undertone: Undertone;
  depth: Depth;
  /** Loose seasonal-analysis label, for flavour. */
  season: string;
  neutrals: Palette;
  recommendations: Palette[];
  avoid: Palette;
}

// --- Colour-space conversions -------------------------------------------------

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const normHue = (h: number) => ((Math.round(h) % 360) + 360) % 360;

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = normHue(h);
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  return { r: clamp255((r + m) * 255), g: clamp255((g + m) * 255), b: clamp255((b + m) * 255) };
}

const toHex = (n: number) => clamp255(n).toString(16).padStart(2, "0");

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

// --- Classification -----------------------------------------------------------

/**
 * Warmth is judged from the red-vs-blue balance, normalised so it does not just
 * track how dark the skin is. Golden/olive skin skews red; rosy/cool skin has
 * more blue in it.
 */
export function classifyUndertone({ r, b }: RGB): Undertone {
  const warmth = (r - b) / Math.max(1, r + b);
  if (warmth >= 0.28) return "warm";
  if (warmth <= 0.18) return "cool";
  return "neutral";
}

export function classifyDepth({ l }: HSL): Depth {
  if (l >= 62) return "light";
  if (l >= 38) return "medium";
  return "deep";
}

const SEASON: Record<string, string> = {
  "warm-light": "Warm Spring",
  "warm-medium": "Warm Autumn",
  "warm-deep": "Deep Autumn",
  "cool-light": "Cool Summer",
  "cool-medium": "Cool Summer",
  "cool-deep": "Cool Winter",
  "neutral-light": "Soft Spring",
  "neutral-medium": "True Neutral",
  "neutral-deep": "Deep Winter",
};

// --- Colour naming ------------------------------------------------------------

const HUE_NAMES: [number, string][] = [
  [15, "Red"],
  [38, "Orange"],
  [50, "Amber"],
  [68, "Yellow"],
  [90, "Chartreuse"],
  [160, "Green"],
  [190, "Teal"],
  [215, "Cyan"],
  [255, "Blue"],
  [285, "Indigo"],
  [320, "Violet"],
  [345, "Magenta"],
  [360, "Rose"],
];

export function describeColor(h: number, s: number, l: number): string {
  const hue = normHue(h);
  const base = HUE_NAMES.find(([edge]) => hue < edge)?.[1] ?? "Red";
  const parts: string[] = [];
  if (s <= 24) parts.push("Muted");
  if (l <= 30) parts.push("Deep");
  else if (l >= 74) parts.push("Pale");
  parts.push(base);
  return parts.join(" ");
}

// --- Palette generation -------------------------------------------------------

interface Tone {
  off: number;
  s: number;
  l: number;
}

const swatch = (baseHue: number, { off, s, l }: Tone): Swatch => {
  const hue = normHue(baseHue + off);
  return { hex: rgbToHex(hslToRgb({ h: hue, s, l })), name: describeColor(hue, s, l) };
};

const HARMONIES: { key: string; title: string; rationale: string; tones: Tone[] }[] = [
  {
    key: "complementary",
    title: "Complementary",
    rationale:
      "Directly opposite your skin's hue on the wheel — the strongest, most flattering contrast, so your complexion reads clear and bright.",
    tones: [
      { off: 180, s: 64, l: 46 },
      { off: 180, s: 52, l: 68 },
      { off: 180, s: 72, l: 32 },
    ],
  },
  {
    key: "split-complementary",
    title: "Split-complementary",
    rationale:
      "The two hues flanking your complement — vivid, but softer and easier to wear head-to-toe than a straight complement.",
    tones: [
      { off: 150, s: 60, l: 48 },
      { off: 210, s: 60, l: 46 },
      { off: 180, s: 36, l: 70 },
    ],
  },
  {
    key: "triadic",
    title: "Triadic",
    rationale:
      "An evenly-spaced trio around the wheel — balanced and colourful, great for an accent piece against a neutral base.",
    tones: [
      { off: 120, s: 58, l: 48 },
      { off: 240, s: 58, l: 46 },
      { off: 120, s: 44, l: 68 },
    ],
  },
  {
    key: "analogous",
    title: "Analogous",
    rationale:
      "Neighbours of your undertone — a tonal, understated harmony that stays close to your natural warmth or coolness.",
    tones: [
      { off: 35, s: 52, l: 54 },
      { off: -35, s: 48, l: 50 },
      { off: 45, s: 40, l: 66 },
    ],
  },
];

const NEUTRALS: Record<Undertone, Swatch[]> = {
  warm: [
    { hex: "#F3E9D2", name: "Ivory" },
    { hex: "#C19A6B", name: "Camel" },
    { hex: "#6B6238", name: "Olive" },
    { hex: "#4A3728", name: "Chocolate" },
  ],
  cool: [
    { hex: "#F5F7FA", name: "Optic White" },
    { hex: "#708090", name: "Slate Gray" },
    { hex: "#26324D", name: "Navy" },
    { hex: "#36454F", name: "Charcoal" },
  ],
  neutral: [
    { hex: "#F2F0EB", name: "Soft White" },
    { hex: "#8B8589", name: "Taupe" },
    { hex: "#4A6272", name: "Denim" },
    { hex: "#4C4C4C", name: "Graphite" },
  ],
};

/**
 * The single entry point: turn a sampled skin RGB into a full colour analysis.
 */
export function analyzeSkinTone(rgb: RGB): ColorAnalysis {
  const hsl = rgbToHsl(rgb);
  const undertone = classifyUndertone(rgb);
  const depth = classifyDepth(hsl);
  const season = SEASON[`${undertone}-${depth}`] ?? "True Neutral";

  const recommendations: Palette[] = HARMONIES.map((h) => ({
    key: h.key,
    title: h.title,
    rationale: h.rationale,
    colors: h.tones.map((t) => swatch(hsl.h, t)),
  }));

  const neutrals: Palette = {
    key: "neutrals",
    title: "Everyday neutrals",
    rationale: `Undertone-matched neutrals that read clean against ${undertone} skin — the safe base for any outfit.`,
    colors: NEUTRALS[undertone],
  };

  const avoid: Palette = {
    key: "avoid",
    title: "Go easy on these",
    rationale:
      "Low-saturation colours sitting right on your own hue blend into your skin, flattening contrast and reading sallow.",
    colors: [
      swatch(hsl.h, { off: 0, s: 26, l: 50 }),
      swatch(hsl.h, { off: 12, s: 20, l: 58 }),
    ],
  };

  return {
    skin: { hex: rgbToHex(rgb), rgb, hsl },
    undertone,
    depth,
    season,
    neutrals,
    recommendations,
    avoid,
  };
}

/** A few representative skin tones for an instant, photo-free demo. */
export const PRESET_SKIN_TONES: { name: string; rgb: RGB }[] = [
  { name: "Fair rosy", rgb: { r: 240, g: 200, b: 195 } },
  { name: "Light warm", rgb: { r: 226, g: 178, b: 138 } },
  { name: "Golden tan", rgb: { r: 198, g: 134, b: 92 } },
  { name: "Warm brown", rgb: { r: 141, g: 92, b: 60 } },
  { name: "Deep cool", rgb: { r: 92, g: 66, b: 58 } },
];
