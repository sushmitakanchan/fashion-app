import { describe, expect, test } from "bun:test";

import {
  analyzeSkinTone,
  classifyDepth,
  classifyUndertone,
  describeColor,
  hexToRgb,
  hslToRgb,
  PRESET_SKIN_TONES,
  rgbToHex,
  rgbToHsl,
  type RGB,
} from "./color-science";

describe("colour-space conversions", () => {
  test("hex round-trips through rgb", () => {
    for (const hex of ["#000000", "#FFFFFF", "#C68A5C", "#26324D"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  test("shorthand hex expands", () => {
    expect(hexToRgb("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  test("rgb -> hsl -> rgb is stable within rounding", () => {
    const samples: RGB[] = [
      { r: 198, g: 134, b: 92 },
      { r: 240, g: 200, b: 195 },
      { r: 92, g: 66, b: 58 },
    ];
    for (const rgb of samples) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  test("pure red is hue 0", () => {
    expect(Math.round(rgbToHsl({ r: 255, g: 0, b: 0 }).h)).toBe(0);
  });

  test("hue wraps: 360 behaves like 0", () => {
    expect(hslToRgb({ h: 360, s: 100, l: 50 })).toEqual(hslToRgb({ h: 0, s: 100, l: 50 }));
  });
});

describe("classification", () => {
  test("golden tan reads warm", () => {
    expect(classifyUndertone({ r: 198, g: 134, b: 92 })).toBe("warm");
  });

  test("fair rosy reads cool", () => {
    expect(classifyUndertone({ r: 240, g: 200, b: 195 })).toBe("cool");
  });

  test("balanced mid-tone reads neutral", () => {
    expect(classifyUndertone({ r: 200, g: 150, b: 120 })).toBe("neutral");
  });

  test("depth tracks lightness", () => {
    expect(classifyDepth({ h: 30, s: 40, l: 80 })).toBe("light");
    expect(classifyDepth({ h: 30, s: 40, l: 50 })).toBe("medium");
    expect(classifyDepth({ h: 30, s: 40, l: 20 })).toBe("deep");
  });
});

describe("colour naming", () => {
  test("names hue families with lightness/saturation modifiers", () => {
    expect(describeColor(210, 60, 46)).toBe("Cyan");
    expect(describeColor(210, 60, 20)).toBe("Deep Cyan");
    expect(describeColor(210, 60, 80)).toBe("Pale Cyan");
    expect(describeColor(210, 15, 50)).toBe("Muted Cyan");
  });
});

describe("analyzeSkinTone", () => {
  const analysis = analyzeSkinTone({ r: 198, g: 134, b: 92 });

  test("reports the sampled skin colour", () => {
    expect(analysis.skin.hex).toBe(rgbToHex({ r: 198, g: 134, b: 92 }));
    expect(analysis.undertone).toBe("warm");
    expect(analysis.season).toBe("Warm Autumn");
  });

  test("returns four harmony palettes, each with colours", () => {
    expect(analysis.recommendations).toHaveLength(4);
    for (const palette of analysis.recommendations) {
      expect(palette.colors.length).toBeGreaterThan(0);
      for (const c of palette.colors) {
        expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
        expect(c.name.length).toBeGreaterThan(0);
      }
    }
  });

  test("complementary sits opposite the skin hue", () => {
    const skinHue = analysis.skin.hsl.h;
    const comp = analysis.recommendations.find((p) => p.key === "complementary")!;
    const compHue = rgbToHsl(hexToRgb(comp.colors[0].hex)).h;
    const offset = (((compHue - skinHue) % 360) + 360) % 360;
    expect(Math.abs(offset - 180)).toBeLessThan(15);
  });

  test("includes neutrals and an avoid list", () => {
    expect(analysis.neutrals.colors.length).toBeGreaterThan(0);
    expect(analysis.avoid.colors.length).toBeGreaterThan(0);
  });

  test("is deterministic", () => {
    const a = analyzeSkinTone({ r: 141, g: 92, b: 60 });
    const b = analyzeSkinTone({ r: 141, g: 92, b: 60 });
    expect(a).toEqual(b);
  });

  test("every preset produces a full analysis", () => {
    for (const preset of PRESET_SKIN_TONES) {
      const result = analyzeSkinTone(preset.rgb);
      expect(result.recommendations).toHaveLength(4);
      expect(result.neutrals.colors.length).toBeGreaterThan(0);
    }
  });
});
