import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import {
  PLANNED_OUTFIT_SELECT,
  serializePlannedOutfit,
} from "@/lib/aura-outfit-planner";
import { manualOutfitSchema } from "@/lib/validations";

/**
 * Build or replace an event's outfit BY HAND (#207) — the participant picks the
 * pieces themselves, no AI. One deep endpoint serves both "replace one slot" and
 * "build the whole look": the client sends the COMPLETE desired set every time (a
 * single-slot swap is just the current set with one id changed), and the server
 * sets the outfit to exactly that — a true `PUT`.
 *
 * It makes ZERO external calls (no AI, geocoding, or weather), so — unlike
 * `plan`/`replan` — it is NOT behind the Smart Planning consent gate. The event
 * `title` is never selected, holding the privacy invariant structurally even
 * though nothing here could egress it.
 *
 * Create-or-replace: it works on an event with no outfit yet (hand-building never
 * requires running the AI first) and replaces an existing pick in place. A human
 * pick always sets `provenance = user_edited` and carries no AI rationale/gaps —
 * nothing planned it, and the pieces were chosen deliberately. The cached
 * `previewImageUrl` clears whenever the item set changes, exactly as `replan` does.
 */

type RouteContext = { params: Promise<{ eventId: string }> };

type Failure = { code: string; error: string; retryable: boolean };

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

export async function PUT(request: Request, { params }: RouteContext) {
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

  const parsed = manualOutfitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { itemIds } = parsed.data;

  const prisma = getPrisma();

  // Owner-scoped load. `title` is deliberately NOT selected — the privacy
  // invariant is structural, not incidental. The existing pick's ids let us tell
  // whether the item set actually changed (which decides the preview clear).
  let event;
  try {
    event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: {
        id: true,
        userId: true,
        outfit: {
          select: { id: true, items: { select: { wardrobeItemId: true } } },
        },
      },
    });
  } catch (error) {
    console.error("Manual outfit event lookup failed", error);
    return failure(500, {
      code: "outfit-lookup-failed",
      error: "We couldn't open that event. Please try again.",
      retryable: true,
    });
  }
  if (!event) {
    return failure(404, { code: "event-not-found", error: "Not found", retryable: false });
  }

  // Every submitted id must be the caller's own LIVE wardrobe item. A foreign or
  // soft-deleted id fails the whole save (all-or-nothing) — you can only dress an
  // event in clothes you currently own. The ids are already deduped by the schema,
  // so a short count means at least one id was foreign or deleted.
  let ownedLive;
  try {
    ownedLive = await prisma.wardrobeItem.findMany({
      where: { id: { in: itemIds }, userId: event.userId, deletedAt: null },
      select: { id: true },
    });
  } catch (error) {
    console.error("Manual outfit wardrobe lookup failed", error);
    return failure(500, {
      code: "outfit-lookup-failed",
      error: "We couldn't check your wardrobe. Please try again.",
      retryable: true,
    });
  }
  if (ownedLive.length !== itemIds.length) {
    return failure(400, {
      code: "invalid-items",
      error: "Some of those pieces aren't in your wardrobe.",
      retryable: false,
    });
  }

  const items = {
    create: itemIds.map((wardrobeItemId, index) => ({ wardrobeItemId, position: index })),
  };

  let outfit;
  try {
    if (event.outfit) {
      // Replace in place. A human pick flips provenance and drops any AI
      // rationale/gaps; the cached preview clears only on an actual item-set
      // change (a no-op re-save of the same set keeps a valid preview).
      const currentItemIds = event.outfit.items.map((item) => item.wardrobeItemId);
      const itemSetChanged =
        itemIds.length !== currentItemIds.length ||
        new Set(itemIds).size !== new Set([...itemIds, ...currentItemIds]).size;

      outfit = await prisma.plannedOutfit.update({
        where: { id: event.outfit.id },
        data: {
          provenance: "user_edited",
          rationale: null,
          gaps: [],
          ...(itemSetChanged ? { previewImageUrl: null } : {}),
          // deleteMany {} clears the join rows, then create re-adds the new set.
          items: { deleteMany: {}, ...items },
        },
        select: PLANNED_OUTFIT_SELECT,
      });
    } else {
      // Create from nothing — hand-building an event AURA never planned.
      outfit = await prisma.plannedOutfit.create({
        data: {
          eventId: event.id,
          userId: event.userId,
          provenance: "user_edited",
          rationale: null,
          gaps: [],
          items,
        },
        select: PLANNED_OUTFIT_SELECT,
      });
    }
  } catch (error) {
    console.error("Manual outfit persistence failed", error);
    return failure(500, {
      code: "outfit-save-failed",
      error: "We couldn't save this outfit. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ outfit: serializePlannedOutfit(outfit) }, { status: 200 });
}
