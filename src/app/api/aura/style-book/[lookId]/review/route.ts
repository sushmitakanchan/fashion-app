import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  auraStyleBookReviewSchema,
  type AuraStyleBookReview,
} from "@/lib/aura-style-book-review";
import { AiProviderConfigError, generateText } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ lookId: string }> };

type Failure = {
  code: string;
  error: string;
  retryable: boolean;
};

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

/**
 * Isolate the JSON object from a model reply. `generateText` is non-JSON-mode,
 * so a vision model reliably wraps its object in a ```json fence (and sometimes
 * a line of prose), which bare `JSON.parse` rejects. Strip a leading/trailing
 * fence, then fall back to the outermost `{…}` span so surrounding text can't
 * fail an otherwise-valid review.
 */
function extractJson(text: string): string {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (unfenced.startsWith("{")) return unfenced;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

function parseReview(text: string): AuraStyleBookReview | null {
  try {
    const parsed = auraStyleBookReviewSchema.safeParse(
      JSON.parse(extractJson(text)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const REVIEW_INSTRUCTIONS = `
You are AURA, an encouraging and precise fashion reviewer. You will receive two
images: first a generated outfit look, then the portrait it was made for.

Assess only what is visibly supported by those images. Do not infer a person's
body measurements, identity, age, ethnicity, or personal preferences. The
"fit" category must explain how the outfit visibly reads on the person — its
silhouette, proportions, and visual balance. The "styling" category must
explain the overall style and how the pieces work together. The "colour"
category must use colour-science principles visible in the images: palette
harmony, contrast, saturation, and the colours nearest the face. Do not claim
certainty about undertone if lighting makes it unclear. Give useful, specific
feedback without judging the person.

Generate an independent verdict for this exact outfit and portrait pair. Do
not reuse a generic score, occasion, colour observation, or recommendation
from another look. Base the overall score and every category score on visible
evidence from this specific image. For the outfitReview, name the most plausible
occasion from its visible formality and styling, say how its silhouette reads on
the person, and call out the visible palette or face-adjacent colour effect.

Return only valid JSON. It must match this shape exactly:
{
  "overallScore": number from 1 through 5,
  "description": "one concise outfit description",
  "outfitReview": "one natural, contemporary Gen Z editorial sentence of at most 240 characters, concise enough to display in two lines. It must name a plausible occasion where the look works (such as brunch, a casual date, dinner, or the office) and synthesize this outfit's style, how the outfit reads on the person, and specific visible colour-science observations. Keep it warm and specific, never try-hard or overly slangy.",
  "categories": [
    {"key":"fit","score":number,"verdict":"short verdict","evidence":"visible evidence","nextStep":"one practical suggestion"},
    {"key":"colour","score":number,"verdict":"short verdict","evidence":"visible evidence","nextStep":"one practical suggestion"},
    {"key":"styling","score":number,"verdict":"short verdict","evidence":"visible evidence","nextStep":"one practical finishing suggestion, such as adding or swapping a bag, shoe, or layer"}
  ]
}
`;

/**
 * Owner-scoped vision review for one Saved Look. The browser supplies only the
 * route id; this handler returns a previously validated verdict when available,
 * or retrieves server-owned image URLs to generate and save the first verdict.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, {
      code: "unauthorized",
      error: "Unauthorized",
      retryable: false,
    });
  }

  const { lookId } = await context.params;
  let look: {
    caption: string;
    lookImageUrl: string;
    portraitUrl: string;
    sources: unknown;
    auraReview: unknown;
  } | null;

  try {
    look = await getPrisma().savedLook.findFirst({
      where: { id: lookId, user: { clerkId: userId } },
      select: {
        caption: true,
        lookImageUrl: true,
        portraitUrl: true,
        sources: true,
        auraReview: true,
      },
    });
  } catch (error) {
    console.error("Style Book review lookup failed", error);
    return failure(500, {
      code: "review-lookup-failed",
      error: "We couldn't open this look for review. Please try again.",
      retryable: true,
    });
  }

  // A scoped miss is deliberately indistinguishable from a nonexistent look.
  if (!look) {
    return failure(404, {
      code: "look-not-found",
      error: "We couldn't find that saved look.",
      retryable: false,
    });
  }

  const savedReview = auraStyleBookReviewSchema.safeParse(look.auraReview);
  if (savedReview.success) {
    return NextResponse.json(savedReview.data);
  }

  try {
    const { text } = await generateText({
      instructions: REVIEW_INSTRUCTIONS,
      prompt: `Review the saved look "${look.caption}". The supplied garment/source names are ${JSON.stringify(
        Array.isArray(look.sources)
          ? look.sources
              .map((source) =>
                typeof source === "object" && source !== null && "name" in source
                  ? (source as { name?: unknown }).name
                  : null,
              )
              .filter((name): name is string => typeof name === "string")
          : [],
      )}.`,
      images: [
        { url: look.lookImageUrl },
        { url: look.portraitUrl },
      ],
    });
    const review = parseReview(text);
    if (!review) {
      console.error("Style Book review returned an invalid response");
      return failure(502, {
        code: "invalid-review-response",
        error: "AURA couldn't format this review. Please try again.",
        retryable: true,
      });
    }

    try {
      await getPrisma().savedLook.update({
        where: { id: lookId },
        data: { auraReview: review },
      });
    } catch (error) {
      console.error("Style Book review persistence failed", error);
      return failure(500, {
        code: "review-save-failed",
        error: "AURA reviewed this look, but we couldn't save it. Please try again.",
        retryable: true,
      });
    }

    return NextResponse.json(review);
  } catch (error) {
    if (error instanceof AiProviderConfigError) {
      return failure(503, {
        code: "ai-unavailable",
        error: "AURA reviews are unavailable right now.",
        retryable: true,
      });
    }

    console.error("Style Book review generation failed", error);
    return failure(502, {
      code: "review-failed",
      error: "AURA couldn't review this look. Please try again.",
      retryable: true,
    });
  }
}
