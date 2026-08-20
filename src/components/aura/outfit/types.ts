import type { PlannedOutfitDto } from "@/lib/aura-outfit-planner";

/** An inline nudge to an already-planned outfit (#178): Regenerate the whole pick
 *  or Swap one wardrobe piece. Mirrors the route's discriminated body. */
export type OutfitEdit = { mode: "regenerate" } | { mode: "swap"; itemId: string };

/** The plan/replan route reply: a fresh outfit, or an error, or a consent code. */
export type PlanResponse = { outfit?: PlannedOutfitDto; error?: string; code?: string };

/** The preview route reply (#169). */
export type PreviewResponse = {
  previewImageUrl?: string;
  error?: string;
  retryable?: boolean;
};

/** The outcome of one plan/replan request, normalized for the caller: a fresh
 *  outfit, a consent gate to raise, or a user-facing error message. */
export type PlanResult =
  | { outfit: PlannedOutfitDto }
  | { consentRequired: true }
  | { error: string };
