import { z } from "zod";

export const AURA_REVIEW_CATEGORY_KEYS = [
  "fit",
  "colour",
  "styling",
] as const;

export type AuraReviewCategoryKey = (typeof AURA_REVIEW_CATEGORY_KEYS)[number];

const reviewCategorySchema = z.object({
  key: z.enum(AURA_REVIEW_CATEGORY_KEYS),
  score: z.number().min(1).max(5),
  verdict: z.string().trim().min(1).max(80),
  evidence: z.string().trim().min(1).max(300),
  nextStep: z.string().trim().min(1).max(180),
});

/** The server-owned, strictly validated response contract for one AURA review. */
export const auraStyleBookReviewSchema = z
  .object({
    overallScore: z.number().min(1).max(5),
    description: z.string().trim().min(1).max(220),
    /** One concise, UI-ready verdict for the compact review card. */
    outfitReview: z.string().trim().min(1).max(180),
    categories: z.array(reviewCategorySchema).length(3),
  })
  .superRefine((review, context) => {
    const keys = review.categories.map((category) => category.key);
    const uniqueKeys = new Set(keys);
    if (
      uniqueKeys.size !== AURA_REVIEW_CATEGORY_KEYS.length ||
      AURA_REVIEW_CATEGORY_KEYS.some(
        (key, index) => !uniqueKeys.has(key) || keys[index] !== key,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A review must contain fit, colour, and styling exactly once in that order.",
        path: ["categories"],
      });
    }
  });

export type AuraStyleBookReview = z.infer<typeof auraStyleBookReviewSchema>;
