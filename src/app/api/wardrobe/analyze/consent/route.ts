import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { isWardrobeAnalysisConsentActive } from "@/lib/wardrobe";
import { getOrProvisionUserId } from "@/lib/wardrobe-user";
import { WARDROBE_ANALYSIS_POLICY_VERSION } from "@/lib/wardrobe-analysis-policy";
import { wardrobeConsentGrantSchema } from "@/lib/validations";

type ConsentRow = {
  policyVersion: string;
  consentedAt: Date;
  withdrawnAt: Date | null;
} | null;

/** The consent state the client reads to decide whether to disclose again. */
function consentState(consent: ConsentRow) {
  return {
    active: isWardrobeAnalysisConsentActive(consent, WARDROBE_ANALYSIS_POLICY_VERSION),
    policyVersion: consent?.policyVersion ?? null,
    consentedAt: consent?.consentedAt.toISOString() ?? null,
    withdrawnAt: consent?.withdrawnAt?.toISOString() ?? null,
    currentPolicyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
  };
}

const CONSENT_FAILED = "We couldn't update your AI-analysis choice. Please try again.";

const consentSelect = {
  policyVersion: true,
  consentedAt: true,
  withdrawnAt: true,
} as const;

/** Report the caller's current AI-analysis consent state. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same 503 config contract as the grant/withdraw handlers, rather than a
  // generic 500, when persistence is unavailable.
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    const consent = user
      ? await prisma.wardrobeAnalysisConsent.findUnique({
          where: { userId: user.id },
          select: consentSelect,
        })
      : null;
    return NextResponse.json(consentState(consent));
  } catch (error) {
    console.error("Wardrobe consent lookup failed", error);
    return NextResponse.json({ error: CONSENT_FAILED }, { status: 500 });
  }
}

/**
 * Record consent to optional AI analysis for the current batch. The client
 * echoes back the exact policy version it disclosed; a mismatch against the
 * server's current version (a stale disclosure) is refused rather than silently
 * recording consent to different terms.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = wardrobeConsentGrantSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.policyVersion !== WARDROBE_ANALYSIS_POLICY_VERSION) {
    return NextResponse.json(
      {
        error: "This disclosure is out of date. Please review it again.",
        currentPolicyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
      },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrisma();
    const ownerId = await getOrProvisionUserId(prisma, userId);
    if (!ownerId) {
      return NextResponse.json({ error: CONSENT_FAILED }, { status: 500 });
    }

    const now = new Date();
    // Re-granting clears any prior withdrawal and refreshes the recorded moment.
    const consent = await prisma.wardrobeAnalysisConsent.upsert({
      where: { userId: ownerId },
      create: {
        userId: ownerId,
        policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
        consentedAt: now,
      },
      update: {
        policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
        consentedAt: now,
        withdrawnAt: null,
      },
      select: consentSelect,
    });
    return NextResponse.json(consentState(consent));
  } catch (error) {
    console.error("Wardrobe consent grant failed", error);
    return NextResponse.json({ error: CONSENT_FAILED }, { status: 500 });
  }
}

/**
 * Withdraw consent to future AI analysis. Idempotent, and deliberately narrow:
 * it only marks the consent inactive going forward and never touches a saved
 * Wardrobe Item or a suggestion the owner already confirmed.
 */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    if (!user) {
      // Nothing to withdraw — report the (inactive) state rather than an error.
      return NextResponse.json(consentState(null));
    }

    const existing = await prisma.wardrobeAnalysisConsent.findUnique({
      where: { userId: user.id },
      select: consentSelect,
    });
    if (!existing || existing.withdrawnAt !== null) {
      return NextResponse.json(consentState(existing));
    }

    const consent = await prisma.wardrobeAnalysisConsent.update({
      where: { userId: user.id },
      data: { withdrawnAt: new Date() },
      select: consentSelect,
    });
    return NextResponse.json(consentState(consent));
  } catch (error) {
    console.error("Wardrobe consent withdrawal failed", error);
    return NextResponse.json({ error: CONSENT_FAILED }, { status: 500 });
  }
}
