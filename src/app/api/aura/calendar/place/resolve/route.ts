import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { geocodePlace } from "@/lib/geocoding";
import { isPlanningConsentActive } from "@/lib/planning-consent";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { plannedEventPlaceResolveSchema } from "@/lib/validations";

/**
 * Dry-run the planner's place resolution so the Add/Edit event form can tell the
 * owner, as they type, whether the place they entered will yield weather-based
 * outfit suggestions. This geocodes exactly what the planner would — so it is
 * **egress**, and lives behind the same Smart Planning consent gate. When consent
 * isn't active we don't touch the network; we return `consent_required` so the
 * form can nudge the owner to enable Smart Planning instead of silently failing.
 *
 * Only `placeText` reaches this route — never the event title — mirroring the
 * privacy invariant of the pipeline it previews.
 */

/** The probe outcome the form renders. `consent_required` is the nudge signal. */
type ResolveResponse =
  | { status: "consent_required" }
  | { status: "resolved"; placeLabel: string; approximate: boolean }
  | { status: "unresolved" };

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

  const parsed = plannedEventPlaceResolveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrisma();

    // Read consent without provisioning a user: this is a non-mutating preview,
    // and a caller with no user row simply has no active consent yet.
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    const consent = user
      ? await prisma.planningConsent.findUnique({
          where: { userId: user.id },
          select: { policyVersion: true, consentedAt: true, withdrawnAt: true },
        })
      : null;

    // The egress boundary: no active consent → no geocoding, just the nudge.
    if (!isPlanningConsentActive(consent, PLANNING_POLICY_VERSION)) {
      return NextResponse.json({
        status: "consent_required",
      } satisfies ResolveResponse);
    }

    const outcome = await geocodePlace(parsed.data.placeText);
    if (outcome.status === "resolved") {
      return NextResponse.json({
        status: "resolved",
        placeLabel: outcome.place.placeLabel,
        approximate: outcome.approximate,
      } satisfies ResolveResponse);
    }
    return NextResponse.json({ status: "unresolved" } satisfies ResolveResponse);
  } catch (error) {
    console.error("Place resolution probe failed", error);
    return NextResponse.json(
      { error: "We couldn't check that place. Please try again." },
      { status: 500 },
    );
  }
}
