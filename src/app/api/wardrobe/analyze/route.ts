import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isCloudinaryConfigured,
  isDatabaseConfigured,
  isOpenAIConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { isOwnedWardrobeMediaId, isWardrobeAnalysisConsentActive } from "@/lib/wardrobe";
import { signedWardrobeMediaUrl } from "@/lib/wardrobe-media";
import { analyzeWardrobeImage } from "@/lib/wardrobe-analysis";
import { WARDROBE_ANALYSIS_POLICY_VERSION } from "@/lib/wardrobe-analysis-policy";
import { wardrobeAnalyzeSchema } from "@/lib/validations";

/**
 * Optional AI categorisation for one import batch. This is the *only* place a
 * wardrobe image reaches OpenAI, and it is gated three ways: active consent for
 * the current policy version, owner-scoped media, and a signed URL minted
 * server-side. Only the normalized rendition is analysed; the request carries no
 * confirmed attribute or edit. Each image independently yields an editable
 * suggestion or a needs-review outcome — the endpoint never fabricates and never
 * fails the batch on a single image.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Needs the model (OpenAI), signed delivery (Cloudinary), and the consent
  // record (database) all live.
  if (
    !(isOpenAIConfigured() && isCloudinaryConfigured() && isDatabaseConfigured())
  ) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = wardrobeAnalyzeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items } = parsed.data;

  // Only ever analyse the caller's own normalized media.
  const foreignMedia = items.some(
    (item) => !isOwnedWardrobeMediaId(item.normalizedMediaId, userId),
  );
  if (foreignMedia) {
    return NextResponse.json(
      { error: "Those images don't belong to your wardrobe." },
      { status: 403 },
    );
  }

  // Consent is required and must be active under the current policy version.
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    const consent = user
      ? await prisma.wardrobeAnalysisConsent.findUnique({
          where: { userId: user.id },
          select: { policyVersion: true, withdrawnAt: true },
        })
      : null;
    if (!isWardrobeAnalysisConsentActive(consent, WARDROBE_ANALYSIS_POLICY_VERSION)) {
      return NextResponse.json(
        {
          error: "AI analysis needs your consent first.",
          code: "consent-required",
        },
        { status: 403 },
      );
    }
  } catch (error) {
    console.error("Wardrobe analysis consent check failed", error);
    return NextResponse.json(
      { error: "We couldn't check your analysis consent. Please try again." },
      { status: 500 },
    );
  }

  // Analyse each image independently — the boundary never throws, so one image's
  // needs-review outcome never disturbs the others.
  const analysed = await Promise.all(
    items.map(async (item) => {
      const { url } = signedWardrobeMediaUrl(
        item.normalizedMediaId,
        item.normalizedMediaFormat,
      );
      const outcome = await analyzeWardrobeImage(url, userId);
      return { clientId: item.clientId, ...outcome };
    }),
  );

  return NextResponse.json({ items: analysed });
}
