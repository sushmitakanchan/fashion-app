import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { isPlanningEgressAllowed } from "@/lib/planning-consent";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import {
  PLANNED_OUTFIT_SELECT,
  serializePlannedOutfit,
} from "@/lib/aura-outfit-planner";
import { buildPlannedOutfit, type PlannerEvent } from "@/lib/aura-planner-run";
import { planningEgressSchema } from "@/lib/validations";

/**
 * Plan ONE event's outfit from the wardrobe with a single AI call (spec §3–§5,
 * ticket #176). It mirrors the Style Book review route's discipline — strict
 * prompt + Zod + fence-strip → parse → safeParse, non-streaming — and sits behind
 * the same Smart Planning consent boundary as live weather.
 *
 * The event **title never egresses** and is never even selected below: the planner
 * works from occasion, when, place, weather, style, and the wardrobe list only.
 *
 * The model intermittently invents ids, so every returned id is validated against
 * the fed set; a miss triggers one retry with the exact allowed-id list, and any
 * id still invalid after that is dropped and gap-flagged — never a phantom or a
 * foreign item. Beyond the ~7-day weather horizon (or when the place can't be
 * located) the plan degrades to occasion + style + place with a note.
 */

type RouteContext = { params: Promise<{ eventId: string }> };

type Failure = { code: string; error: string; retryable: boolean };

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, { code: "unauthorized", error: "Unauthorized", retryable: false });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE, code: "not-configured", retryable: true },
      { status: 503 },
    );
  }

  const { eventId } = await params;

  const parsed = planningEgressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Owner-scoped load. `title` is deliberately NOT selected — it must never reach
  // an outbound payload, and not selecting it makes that structural.
  let event;
  try {
    event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: {
        id: true,
        userId: true,
        occasion: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        placeText: true,
        placeLabel: true,
        latitude: true,
        longitude: true,
        timezone: true,
        outfit: { select: { id: true } },
        user: {
          select: {
            planningConsent: { select: { policyVersion: true, withdrawnAt: true } },
            stylePreference: { select: { text: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Planner event lookup failed", error);
    return failure(500, {
      code: "plan-lookup-failed",
      error: "We couldn't open that event. Please try again.",
      retryable: true,
    });
  }
  if (!event) {
    return failure(404, { code: "event-not-found", error: "Not found", retryable: false });
  }

  // Non-destructive: "Plan this outfit" only fills an unplanned event. Regenerate
  // (a later ticket) is what replaces an existing pick.
  if (event.outfit) {
    return failure(409, {
      code: "already-planned",
      error: "This event already has an outfit.",
      retryable: false,
    });
  }

  // The boundary gate, re-checked immediately before any egress (geocoding,
  // weather, and the AI call all sit behind it).
  if (
    !isPlanningEgressAllowed(
      event.user.planningConsent,
      parsed.data.policyVersion,
      PLANNING_POLICY_VERSION,
    )
  ) {
    return NextResponse.json(
      {
        error: "Smart Planning consent is required.",
        code: "consent-required",
        currentPolicyVersion: PLANNING_POLICY_VERSION,
        retryable: false,
      },
      { status: 403 },
    );
  }

  // ---- Egress is authorized from here. ----

  // Load the wardrobe, resolve weather, build the prompt, and run the shared
  // id-discipline loop (identical to Regenerate/Swap). A ready error response
  // comes back for an empty wardrobe, a wardrobe-read failure, or an unusable reply.
  const run = await buildPlannedOutfit({
    prisma,
    event: event as PlannerEvent,
    stylePreference: event.user.stylePreference?.text ?? null,
  });
  if (!run.ok) return run.response;
  const { itemIds, gaps, output } = run;

  let outfit;
  try {
    outfit = await prisma.plannedOutfit.create({
      data: {
        eventId: event.id,
        userId: event.userId,
        provenance: "ai_planned",
        rationale: output.rationale,
        gaps,
        items: {
          create: itemIds.map((wardrobeItemId, index) => ({
            wardrobeItemId,
            position: index,
          })),
        },
      },
      select: PLANNED_OUTFIT_SELECT,
    });
  } catch (error) {
    console.error("Planner outfit persistence failed", error);
    return failure(500, {
      code: "plan-save-failed",
      error: "AURA planned this outfit, but we couldn't save it. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ outfit: serializePlannedOutfit(outfit) }, { status: 201 });
}
