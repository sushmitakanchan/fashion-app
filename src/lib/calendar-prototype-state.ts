/**
 * UI-prototype-only routing state for the three Outfit Calendar week-view layouts.
 *
 * Three radically different week surfaces, switchable via `?variant=`, on the
 * throwaway `/aura/calendar/prototype` route. Resolves wayfinder ticket #162
 * (week-view UX + route/placement). Throwaway — nothing here ships.
 */
export const CALENDAR_VARIANTS = [
  {
    key: "board",
    label: "A — Week board",
    description: "Seven day-columns; scan the whole week at a glance.",
  },
  {
    key: "agenda",
    label: "B — Agenda",
    description: "A vertical day-sectioned list; each outfit gets room to act.",
  },
  {
    key: "focus",
    label: "C — Focus",
    description: "A week rail beside one big outfit + preview (master-detail).",
  },
] as const;

export type CalendarVariant = (typeof CALENDAR_VARIANTS)[number]["key"];

const DEFAULT_VARIANT: CalendarVariant = "board";

export function readCalendarVariant(
  value: string | null | undefined,
): CalendarVariant {
  const match = CALENDAR_VARIANTS.find((variant) => variant.key === value);
  return match?.key ?? DEFAULT_VARIANT;
}

export function stepCalendarVariant(
  current: CalendarVariant,
  direction: -1 | 1,
): CalendarVariant {
  const index = CALENDAR_VARIANTS.findIndex(
    (variant) => variant.key === current,
  );
  return CALENDAR_VARIANTS[
    (index + direction + CALENDAR_VARIANTS.length) % CALENDAR_VARIANTS.length
  ].key;
}

/** Kept pure so the production safety gate has a direct regression test. */
export function showPrototypeControls(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
