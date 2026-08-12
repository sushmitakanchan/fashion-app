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
import { outfitEditSchema } from "@/lib/validations";

/**
 * Nudge a planned outfit the participant doesn't like without redoing the week
 * (spec §4, ticket #178). Two inline edits on an already-planned event, each a
 * single AI call:
 *
 *   - **Regenerate** feeds the current pick's ids as "don't reuse these; produce a
 *     different outfit."
 *   - **Swap a piece** excludes just the targeted item and keeps the rest as fixed
 *     "keep these" context, so only that one slot moves.
 *
 * Exclusion is **prompt-level and soft**: it guarantees a different result in the
 * normal case, but when nothing else fits the planner returns its best pick with a
 * rationale note rather than a fabricated gap (the same id-discipline loop as the
 * initial plan, via {@link runPlanner}). Because this is a human edit, the outfit's
 * provenance flips to `user_edited`, and — an item-set change — its cached
 * `previewImageUrl` clears to null so a stale preview is never shown.
 *
 * It sits behind the same Smart Planning consent boundary as the initial plan and
 * live weather, and the event **title is never selected**, so it can't egress.
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

  const parsed = outfitEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const edit = parsed.data;

  const prisma = getPrisma();

  // Owner-scoped load. `title` is deliberately NOT selected — it must never reach
  // an outbound payload, and not selecting it makes that structural. The existing
  // outfit's item ids drive the soft exclusion (Regenerate excludes them all; Swap
  // excludes one and keeps the rest).
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
        outfit: {
          select: { id: true, items: { select: { wardrobeItemId: true } } },
        },
        user: {
          select: {
            planningConsent: { select: { policyVersion: true, withdrawnAt: true } },
            stylePreference: { select: { text: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Replan event lookup failed", error);
    return failure(500, {
      code: "plan-lookup-failed",
      error: "We couldn't open that event. Please try again.",
      retryable: true,
    });
  }
  if (!event) {
    return failure(404, { code: "event-not-found", error: "Not found", retryable: false });
  }

  // Regenerate/Swap only edit an existing pick. "Plan this outfit" is what creates
  // one — a still-unplanned event has nothing to nudge.
  if (!event.outfit) {
    return failure(409, {
      code: "not-planned",
      error: "Plan this outfit first, then you can regenerate or swap a piece.",
      retryable: false,
    });
  }

  const currentItemIds = event.outfit.items.map((item) => item.wardrobeItemId);

  // Swap targets one piece that must belong to the current outfit — never an
  // arbitrary id.
  if (edit.mode === "swap" && !currentItemIds.includes(edit.itemId)) {
    return failure(404, {
      code: "item-not-in-outfit",
      error: "That piece isn't part of this outfit.",
      retryable: false,
    });
  }

  // The boundary gate, re-checked immediately before any egress (geocoding,
  // weather, and the AI call all sit behind it).
  if (
    !isPlanningEgressAllowed(
      event.user.planningConsent,
      edit.policyVersion,
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

  // Regenerate → don't reuse the whole current pick. Swap → exclude just the one
  // piece and keep the rest fixed, so only the targeted slot changes. Exclusion is
  // applied prompt-side inside buildPlannedOutfit (soft), which loads the wardrobe,
  // resolves weather, and runs the shared id-discipline loop.
  const exclude = edit.mode === "swap" ? [edit.itemId] : currentItemIds;
  const keep =
    edit.mode === "swap"
      ? currentItemIds.filter((id) => id !== edit.itemId)
      : [];

  const run = await buildPlannedOutfit({
    prisma,
    event: event as PlannerEvent,
    stylePreference: event.user.stylePreference?.text ?? null,
    exclude,
    keep,
  });
  if (!run.ok) return run.response;
  const { itemIds, gaps, output } = run;

  // A human edit always flips provenance to `user_edited` (it never flips back).
  // The cached preview clears only on an actual item-set change — the soft path can
  // legitimately return the same set, and an unchanged preview stays valid.
  const itemSetChanged =
    itemIds.length !== currentItemIds.length ||
    new Set(itemIds).size !== new Set([...itemIds, ...currentItemIds]).size;

  // Persist as a single edit: replace the item set and, when it changed, drop the
  // stale preview. `deleteMany` + `create` swaps the join rows in place.
  let outfit;
  try {
    outfit = await prisma.plannedOutfit.update({
      where: { id: event.outfit.id },
      data: {
        provenance: "user_edited",
        rationale: output.rationale,
        gaps,
        ...(itemSetChanged ? { previewImageUrl: null } : {}),
        items: {
          deleteMany: {},
          create: itemIds.map((wardrobeItemId, index) => ({
            wardrobeItemId,
            position: index,
          })),
        },
      },
      select: PLANNED_OUTFIT_SELECT,
    });
  } catch (error) {
    console.error("Replan outfit persistence failed", error);
    return failure(500, {
      code: "plan-save-failed",
      error: "AURA replanned this outfit, but we couldn't save it. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ outfit: serializePlannedOutfit(outfit) }, { status: 200 });
}
