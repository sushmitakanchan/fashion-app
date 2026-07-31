import { describe, expect, it } from "bun:test";

import { auraStyleBookReviewSchema } from "./aura-style-book-review";

function review() {
  return {
    overallScore: 4.2,
    description: "A polished, layered neutral look.",
    outfitReview:
      "It’s giving date-night energy: the layered neutrals read balanced on you with a harmonious, face-framing palette.",
    categories: [
      {
        key: "fit",
        score: 4.5,
        verdict: "Balanced proportions",
        evidence: "The layers create a long, clear line.",
        nextStep: "Keep the inner layer close to the waist.",
      },
      {
        key: "colour",
        score: 4.1,
        verdict: "Cohesive neutrals",
        evidence: "The tones read as intentionally connected.",
        nextStep: "Add one muted accent near the face.",
      },
      {
        key: "styling",
        score: 4.3,
        verdict: "Well finished",
        evidence: "The accessories continue the tailored mood.",
        nextStep: "Swap one structured piece for texture.",
      },
    ],
  };
}

describe("the AURA Style Book review contract", () => {
  it("accepts the three fixed categories in their display order", () => {
    expect(auraStyleBookReviewSchema.safeParse(review()).success).toBe(true);
  });

  it("accepts a two-line outfitReview and rejects one that would overflow the card", () => {
    // The compact card renders `line-clamp-2`, so the verdict must be a single
    // complete sentence that fits two lines. A tidy ~130-char sentence lands
    // whole; an over-long one (which used to truncate mid-word) is now rejected.
    const twoLine = review();
    twoLine.outfitReview =
      "Dinner-date ready: the tailored charcoal layers read elongated on you, while the cool neutrals stay harmonious and flatter the face.";
    expect(twoLine.outfitReview.length).toBeLessThanOrEqual(150);
    expect(auraStyleBookReviewSchema.safeParse(twoLine).success).toBe(true);

    const overflowing = review();
    overflowing.outfitReview =
      "This is peak dinner-date energy: the tailored charcoal layers read elongated and intentional on you, while the cool-toned neutrals stay harmonious and flatter the face without ever tipping into flat or washed-out.";
    expect(overflowing.outfitReview.length).toBeGreaterThan(150);
    expect(auraStyleBookReviewSchema.safeParse(overflowing).success).toBe(false);
  });

  it("rejects an invalid score and a reordered category payload", () => {
    const invalidScore = review();
    invalidScore.overallScore = 5.1;
    expect(auraStyleBookReviewSchema.safeParse(invalidScore).success).toBe(false);

    const reordered = review();
    [reordered.categories[0], reordered.categories[1]] = [
      reordered.categories[1],
      reordered.categories[0],
    ];
    expect(auraStyleBookReviewSchema.safeParse(reordered).success).toBe(false);
  });
});
