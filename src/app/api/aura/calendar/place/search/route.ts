import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { searchPlaces, type PlaceSuggestion } from "@/lib/geocoding";
import { isPlanningConsentActive } from "@/lib/planning-consent";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { plannedEventPlaceSearchSchema } from "@/lib/validations";

/**
 * Place autocomplete for the Add/Edit event form. As the owner types, this
 * suggests place names the planner can actually resolve — so they pick a
 * geocodable label instead of a bare venue name that yields no weather. It
 * searches the same Open-Meteo index the planner uses, so it is **egress** and
 * sits behind the same Smart Planning consent gate: with consent inactive we
 * touch no network and return `consent_required` so the form can nudge instead.
 *
 * Only the typed query reaches this route — never the event title.
 */

type SearchResponse =
  | { status: "consent_required" }
  | { status: "ok"; places: PlaceSuggestion[] };

export async function GET(request: Request) {
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

  const parsed = plannedEventPlaceSearchSchema.safeParse({
    q: new URL(request.url).searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const prisma = getPrisma();

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

    if (!isPlanningConsentActive(consent, PLANNING_POLICY_VERSION)) {
      return NextResponse.json({
        status: "consent_required",
      } satisfies SearchResponse);
    }

    const places = await searchPlaces(parsed.data.q);
    return NextResponse.json({ status: "ok", places } satisfies SearchResponse);
  } catch (error) {
    console.error("Place search failed", error);
    return NextResponse.json(
      { error: "We couldn't search for that place. Please try again." },
      { status: 500 },
    );
  }
}
