import { describe, expect, it } from "bun:test";

import { shortPlaceLabel } from "./calendar-place";

describe("shortPlaceLabel", () => {
  it("leaves a typed place name alone", () => {
    expect(shortPlaceLabel("Helen's place")).toBe("Helen's place");
  });

  it("keeps the first segment of a two-part place", () => {
    expect(shortPlaceLabel("Bandra, Mumbai")).toBe("Bandra");
  });

  it("cuts a full postal address down to the place", () => {
    expect(
      shortPlaceLabel("42 Turner Rd, Bandra West, Mumbai, Maharashtra 400050, India"),
    ).toBe("Bandra West");
  });

  it("steps past a street line exactly once, never as far as the city", () => {
    expect(shortPlaceLabel("12 Hill Road, Bandra, Mumbai")).toBe("Bandra");
    expect(shortPlaceLabel("Flat 3B, Sea View, Colaba")).toBe("Sea View");
  });

  it("keeps a venue that merely contains a number", () => {
    expect(shortPlaceLabel("Studio 54, Manhattan")).toBe("Studio 54");
  });

  it("returns a street line whole when it is all there is", () => {
    expect(shortPlaceLabel("42 Turner Rd")).toBe("42 Turner Rd");
  });

  it("ignores empty segments and stray whitespace", () => {
    expect(shortPlaceLabel("  Bandra , , Mumbai ")).toBe("Bandra");
  });

  it("has nothing to show for blank or missing text", () => {
    expect(shortPlaceLabel(null)).toBeNull();
    expect(shortPlaceLabel(undefined)).toBeNull();
    expect(shortPlaceLabel("")).toBeNull();
    expect(shortPlaceLabel("  , ,  ")).toBeNull();
  });
});
