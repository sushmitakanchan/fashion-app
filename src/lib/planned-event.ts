import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import {
  PLANNED_OUTFIT_SELECT,
  serializePlannedOutfit,
  type PlannedOutfitRow,
} from "@/lib/aura-outfit-planner";
import { findClashes, type ClashInterval } from "@/lib/calendar-clash";

/**
 * The Prisma `select` and serializer for a planned event as the calendar
 * consumes it — shared by the list/create route and the edit route so both echo
 * an identical row shape. Weather and the geocoded place fields are deliberately
 * absent: opening the calendar is a pure read with no AI and no external
 * requests, and `placeText` is captured raw (never geocoded here). The planned
 * outfit IS included — it is already-persisted state, so a plan renders on
 * reload without any AI call.
 */
export const eventSelect = {
  id: true,
  title: true,
  occasion: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  placeText: true,
  source: true,
  outfit: { select: PLANNED_OUTFIT_SELECT },
} as const;

export type EventRow = {
  id: string;
  title: string;
  occasion: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  placeText: string | null;
  source: "manual" | "google";
  outfit: PlannedOutfitRow | null;
};

export function serializeEvent(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    occasion: row.occasion,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    allDay: row.allDay,
    placeText: row.placeText,
    source: row.source,
    outfit: row.outfit ? serializePlannedOutfit(row.outfit) : null,
  };
}

/** A clashing event, trimmed to what the client needs to name it in the prompt. */
export type EventClash = { id: string; title: string };

// Personal-calendar events are short (hours), so a ±1-day instant window around
// the candidate bounds the neighbour scan while still catching any realistic
// overlap. The precise decision is the pure `findClashes` rule, not this window.
const CLASH_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The owner's existing timed events that clash with `candidate`, applying the
 * pure {@link findClashes} rule (all-day events never participate; an open-ended
 * event is a point). Shared by the create and edit routes so the soft-overlap
 * guard can't drift between them; pass the edited event's id as `excludeId` so an
 * in-place edit never clashes with itself.
 */
export async function findEventClashes(
  prisma: PrismaClient,
  ownerWhere: Prisma.PlannedEventWhereInput,
  candidate: ClashInterval,
  excludeId?: string,
): Promise<EventClash[]> {
  if (candidate.allDay) return [];
  const start = new Date(candidate.startsAt).getTime();
  const end = candidate.endsAt ? new Date(candidate.endsAt).getTime() : start;

  const neighbours = await prisma.plannedEvent.findMany({
    where: {
      ...ownerWhere,
      allDay: false,
      startsAt: {
        gte: new Date(start - CLASH_WINDOW_MS),
        lt: new Date(end + CLASH_WINDOW_MS),
      },
    },
    select: { id: true, title: true, startsAt: true, endsAt: true, allDay: true },
  });

  return findClashes(candidate, neighbours, excludeId).map((event) => ({
    id: event.id,
    title: event.title,
  }));
}
