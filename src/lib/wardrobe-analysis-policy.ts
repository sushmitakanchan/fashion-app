import type { WardrobeItemCategoryValue } from "@/lib/validations";

/**
 * Client-safe consent policy for optional wardrobe AI analysis. The disclosure
 * text, its version, and the result shapes live here (not in the server-only
 * boundary) so the opt-in UI, the consent route, and the analysis boundary all
 * share one wording and one contract without pulling the OpenAI client into the
 * browser bundle.
 */

/** The consent policy the disclosure describes. Bump when the disclosure's
 *  material terms change — that forces a fresh opt-in, since consent recorded
 *  under an older version is no longer active. */
export const WARDROBE_ANALYSIS_POLICY_VERSION = "2026-07-31.1";

/** The opt-in disclosure shown before any image is analysed. */
export const WARDROBE_ANALYSIS_DISCLOSURE =
  "AI suggestions are optional. If you turn them on, the normalized version of " +
  "each clothing image in this batch is sent to OpenAI — a third-party service — " +
  "to suggest a name, category, colour, brand, and occasion to wear it. Every suggestion is editable, and " +
  "none of your confirmed details or edits are ever sent. OpenAI may retain the " +
  "images for up to 30 days for abuse monitoring before deleting them.";

/** An editable AI categorisation suggestion for one image. `name` is a short,
 *  image-derived product name (e.g. "Flared bottoms"); null when the model can't
 *  tell what the piece is. */
export type WardrobeSuggestion = {
  name: string | null;
  category: WardrobeItemCategoryValue;
  color: string | null;
  brand: string | null;
  occasion: string | null;
};

/** Why an image stayed in manual review instead of receiving a suggestion. */
export type WardrobeAnalysisReason =
  | "timeout"
  | "refused"
  | "policy-rejected"
  | "invalid-response"
  | "uncertain"
  | "multiple-garments";

export type WardrobeAnalysisOutcome =
  | { status: "suggested"; suggestion: WardrobeSuggestion }
  | { status: "needs-review"; reason: WardrobeAnalysisReason };
