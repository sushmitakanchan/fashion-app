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
