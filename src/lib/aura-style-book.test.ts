import { describe, expect, it } from "bun:test";

import { deriveLookCaption, MAX_CAPTION_LENGTH } from "@/lib/aura-style-book";

/**
 * The auto-derived caption is pure logic — a Saved Look is never named by hand
 * in v1 — so it is exercised directly at its input→output seam rather than
 * through the route.
 */
describe("deriveLookCaption", () => {
  it("uses a single source's name verbatim", () => {
    expect(deriveLookCaption(["Linen shirt"])).toBe("Linen shirt");
  });

  it("joins two sources with an ampersand", () => {
    expect(deriveLookCaption(["Linen shirt", "Wide-leg trousers"])).toBe(
      "Linen shirt & Wide-leg trousers",
    );
  });

  it("comma-separates three or more sources, keeping the ampersand last", () => {
    expect(deriveLookCaption(["Shirt", "Trousers", "Loafers"])).toBe(
      "Shirt, Trousers & Loafers",
    );
  });

  it("trims surrounding whitespace and drops blank names", () => {
    expect(deriveLookCaption(["  Shirt  ", "", "   ", "Trousers"])).toBe(
      "Shirt & Trousers",
    );
  });

  it("truncates a caption longer than the cap, staying within it", () => {
    const longName = "A".repeat(MAX_CAPTION_LENGTH + 20);

    const caption = deriveLookCaption([longName]);

    expect(caption.length).toBeLessThanOrEqual(MAX_CAPTION_LENGTH);
    expect(caption.endsWith("…")).toBe(true);
  });

  it("does not truncate a caption exactly at the cap", () => {
    const name = "A".repeat(MAX_CAPTION_LENGTH);

    const caption = deriveLookCaption([name]);

    expect(caption).toBe(name);
    expect(caption.endsWith("…")).toBe(false);
  });

  it("falls back to a stable placeholder when every name is blank", () => {
    // A completed try-on always carries a named garment, so this is a defensive
    // floor rather than a reachable state — but the caption is non-empty either
    // way, since the column is required.
    expect(deriveLookCaption(["", "   "])).toBe("Untitled look");
    expect(deriveLookCaption([])).toBe("Untitled look");
  });
});
