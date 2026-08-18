import {
  PLANNED_OUTFIT_SELECT,
  serializePlannedOutfit,
  type PlannedOutfitRow,
} from "@/lib/aura-outfit-planner";

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
