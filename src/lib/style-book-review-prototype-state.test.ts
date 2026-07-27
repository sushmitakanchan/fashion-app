import { describe, expect, it } from "bun:test";

import {
  readStyleBookReviewVariant,
  showPrototypeControls,
  stepStyleBookReviewVariant,
} from "./style-book-review-prototype-state";

describe("Style Book review prototype state", () => {
  it("keeps a shared URL variant valid across a reload", () => {
    expect(readStyleBookReviewVariant("verdict")).toBe("verdict");
    expect(readStyleBookReviewVariant("report")).toBe("report");
    expect(readStyleBookReviewVariant("unknown")).toBe("editorial");
  });

  it("cycles in both directions with wraparound", () => {
    expect(stepStyleBookReviewVariant("editorial", -1)).toBe("report");
    expect(stepStyleBookReviewVariant("report", 1)).toBe("editorial");
  });

  it("never exposes the prototype control in production", () => {
    expect(showPrototypeControls("development")).toBe(true);
    expect(showPrototypeControls("production")).toBe(false);
  });
});
