import "server-only";

import { z } from "zod";

import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";
import { WARDROBE_ITEM_CATEGORIES } from "@/lib/validations";
import type {
  WardrobeAnalysisOutcome,
  WardrobeAnalysisReason,
} from "@/lib/wardrobe-analysis-policy";

/**
 * The narrow, server-owned OpenAI vision boundary for optional wardrobe
 * categorisation. It accepts exactly one normalized clothing image (as a signed
 * URL the caller already authorized) and returns either an editable suggestion
 * or a needs-review outcome. It is deliberately trust-minimising:
 *
 *  - it sends ONLY the image and a fixed prompt — never a confirmed attribute,
 *    edit history, or the original upload;
 *  - the request is made with `store: false` and at low image detail;
 *  - it never throws and never fabricates: every failure mode (timeout, refusal,
 *    policy rejection, invalid output, uncertainty, multiple garments) collapses
 *    to a needs-review outcome, so the item simply stays in manual review.
 */

// The client-safe consent policy + result types live in the policy module so
// the browser bundle never pulls in this server-only boundary; re-exported here
// for callers already importing the boundary.
export {
  WARDROBE_ANALYSIS_POLICY_VERSION,
  WARDROBE_ANALYSIS_DISCLOSURE,
  type WardrobeSuggestion,
  type WardrobeAnalysisReason,
  type WardrobeAnalysisOutcome,
} from "@/lib/wardrobe-analysis-policy";

const ANALYSIS_TIMEOUT_MS = 20_000;

const ANALYSIS_PROMPT =
  "You are helping catalogue one clothing item for a personal wardrobe. Look at " +
  "the single image and identify the one garment or accessory it shows. Respond " +
  "only in the required JSON. Set assessment to 'single_garment' when exactly one " +
  "clear item is present, 'multiple_garments' when more than one item is shown, " +
  "and 'unclear' when you cannot confidently tell. Give the piece a short, " +
  "specific name for what it is — 2 to 5 words describing the garment itself " +
  "(e.g. 'Flared bottoms', 'Beige linen shirt', 'White leather sneakers'); base " +
  "it only on the image, never on any file name, and use null only if you truly " +
  "cannot tell what the item is. Choose the best category only " +
  "when confident, otherwise use null. Give a short colour and a brand only when " +
  "clearly visible; use null when unsure. Suggest a single short occasion to wear " +
  "the piece (e.g. 'casual', 'office', 'dinner date', 'workout') based on its " +
  "style; use null if you cannot tell. Never guess.";

// Sent to the Responses API as the strict structured-output schema.
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessment: {
      type: "string",
      enum: ["single_garment", "multiple_garments", "unclear"],
    },
    name: { type: ["string", "null"] },
    category: {
      type: ["string", "null"],
      enum: [...WARDROBE_ITEM_CATEGORIES, null],
    },
    color: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    occasion: { type: ["string", "null"] },
  },
  required: ["assessment", "name", "category", "color", "brand", "occasion"],
} as const;

// Re-validated on the way back in — structured outputs are reliable, but a
// schema drift or an unexpected shape must degrade to needs-review, not throw.
const modelOutputSchema = z.object({
  assessment: z.enum(["single_garment", "multiple_garments", "unclear"]),
  name: z.string().nullable(),
  category: z.enum(WARDROBE_ITEM_CATEGORIES).nullable(),
  color: z.string().nullable(),
  brand: z.string().nullable(),
  occasion: z.string().nullable(),
});

function needsReview(reason: WardrobeAnalysisReason): WardrobeAnalysisOutcome {
  return { status: "needs-review", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Map a thrown provider error onto a needs-review reason — never a throw. */
function classifyError(error: unknown): WardrobeAnalysisReason {
  const name = error instanceof Error ? error.name : undefined;
  if (name === "AbortError" || name === "TimeoutError") return "timeout";

  const record = isRecord(error) ? error : undefined;
  const status = record?.status;
  const code = typeof record?.code === "string" ? record.code : undefined;

  if (status === 408 || status === 429) return "timeout";
  if (
    (typeof code === "string" && /policy|moderation/.test(code)) ||
    status === 403
  ) {
    return "policy-rejected";
  }
  return "invalid-response";
}

/** True when the model returned a refusal content part rather than an answer. */
function hasRefusal(response: unknown): boolean {
  const output = isRecord(response) ? response.output : undefined;
  if (!Array.isArray(output)) return false;
  return output.some(
    (item) =>
      isRecord(item) &&
      item.type === "message" &&
      Array.isArray(item.content) &&
      item.content.some((part) => isRecord(part) && part.type === "refusal"),
  );
}

function nonEmpty(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Analyse one normalized clothing image. `imageUrl` must be an owner-authorized,
 * short-lived URL the caller has already minted; `userKey` is passed through as
 * the OpenAI end-user identifier for abuse monitoring only.
 */
export async function analyzeWardrobeImage(
  imageUrl: string,
  userKey: string,
): Promise<WardrobeAnalysisOutcome> {
  let response: { output_text?: string; output?: unknown };
  try {
    response = await getOpenAI().responses.create(
      {
        model: OPENAI_MODEL,
        store: false,
        user: userKey,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: ANALYSIS_PROMPT },
              { type: "input_image", image_url: imageUrl, detail: "low" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "wardrobe_suggestion",
            strict: true,
            schema: RESPONSE_JSON_SCHEMA,
          },
        },
      },
      { timeout: ANALYSIS_TIMEOUT_MS, maxRetries: 1 },
    );
  } catch (error) {
    return needsReview(classifyError(error));
  }

  if (hasRefusal(response)) return needsReview("refused");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(response.output_text ?? "");
  } catch {
    return needsReview("invalid-response");
  }

  const parsed = modelOutputSchema.safeParse(parsedJson);
  if (!parsed.success) return needsReview("invalid-response");

  const { assessment, name, category, color, brand, occasion } = parsed.data;
  if (assessment === "multiple_garments") return needsReview("multiple-garments");
  if (assessment === "unclear" || category === null) return needsReview("uncertain");

  return {
    status: "suggested",
    suggestion: {
      name: nonEmpty(name),
      category,
      color: nonEmpty(color),
      brand: nonEmpty(brand),
      occasion: nonEmpty(occasion),
    },
  };
}
