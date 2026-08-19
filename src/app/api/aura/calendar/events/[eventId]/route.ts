import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";
import {
  eventSelect,
  findEventClashes,
  serializeEvent,
} from "@/lib/planned-event";
import {
  DEFAULT_PLANNED_OCCASION,
  plannedEventUpdateSchema,
} from "@/lib/validations";

type RouteContext = { params: Promise<{ eventId: string }> };

const SAVE_FAILED = "We couldn't save that event. Please try again.";
const TIME_CLASH = "This event overlaps another on your calendar.";

/**
 * Edit one planned event's owner-facing fields (title, occasion, timing, place).
 * Scoped to the owner, so a foreign id resolves to 404 rather than touching
 * another user's calendar. Editing a Google-imported event detaches it to a
 * manual event — its Google-owned fields (title/timing/place) then stop being
 * re-synced (the sync loop skips prior `manual` rows), so the edit sticks. A
 * changed place invalidates the cached geocode so weather re-resolves.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;

  const parsed = plannedEventUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { title, occasion, allDay, startsAt, endsAt, placeText, allowOverlap } =
    parsed.data;

  try {
    const prisma = getPrisma();
    const existing = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: { id: true, placeText: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Soft overlap guard, matching the create route: warn on a time clash with
    // another event unless the owner chose to save anyway (`allowOverlap`). The
    // event being edited is excluded so its new timing never clashes with itself.
    if (!allowOverlap) {
      const clashes = await findEventClashes(
        prisma,
        { user: { clerkId: userId } },
        { startsAt, endsAt: endsAt ?? null, allDay },
        existing.id,
      );
      if (clashes.length > 0) {
        return NextResponse.json(
          { error: TIME_CLASH, code: "time-clash", clashes },
          { status: 409 },
        );
      }
    }

    const nextPlace = placeText ?? null;
    const placeChanged = (existing.placeText ?? null) !== nextPlace;

    const event = await prisma.plannedEvent.update({
      where: { id: existing.id },
      data: {
        title,
        occasion: occasion ?? DEFAULT_PLANNED_OCCASION,
        allDay,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        placeText: nextPlace,
        // The edit is now the owner's — detach from Google so re-sync leaves it
        // alone. Keeps its externalId (Postgres treats it as one row) but the
        // sync loop skips prior `manual` rows, so it won't reimport as a dupe.
        source: "manual",
        // A changed place invalidates the cached geocode; weather re-resolves.
        ...(placeChanged
          ? { latitude: null, longitude: null, timezone: null, placeLabel: null }
          : {}),
      },
      select: eventSelect,
    });

    return NextResponse.json({ event: serializeEvent(event) });
  } catch (error) {
    console.error("Calendar event update failed", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }
}

/**
 * Hard-delete one planned event. Planned events have no soft-delete lifecycle —
 * the timeline is the archive, and manual deletion is the only way anything
 * leaves it. Scoped to the owner: the delete only matches an event that both has
 * this id and belongs to the caller, so a foreign id resolves to a 404 rather
 * than touching another user's calendar. The 1:1 outfit (a later ticket)
 * cascades away with the event by the schema's `onDelete: Cascade`.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;

  try {
    const prisma = getPrisma();
    const event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.plannedEvent.delete({ where: { id: event.id } });
    return NextResponse.json({ id: event.id });
  } catch (error) {
    console.error("Calendar event deletion failed", error);
    return NextResponse.json(
      { error: "We couldn't delete that event. Please try again." },
      { status: 500 },
    );
  }
}
