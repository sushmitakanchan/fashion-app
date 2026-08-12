/**
 * Pure calendar-week math for the Outfit Calendar agenda view.
 *
 * Everything here works in **civil-date** space — a `YYYY-MM-DD` string with no
 * time and no timezone — so the week arithmetic is deterministic and fully
 * testable without a timezone library. The only timezone-aware step is bucketing
 * an event's absolute instant onto a civil date, and even that takes the target
 * timezone as an explicit argument so it can be exercised across offsets.
 *
 * Two rules are load-bearing for the agenda (spec §5):
 *   - The week is **Monday-start**, fixed to the calendar, navigated forward/back.
 *   - The active/past boundary is **start-of-today in the viewer's timezone** —
 *     day-granular, not `now()`.
 *
 * Bucketing rule: a **timed** event lands on its civil date *in the viewer's
 * timezone* (you picked 9am local, it shows on that local day). An **all-day**
 * event is date-only and timezone-independent — it is stored at UTC midnight and
 * always shows on that stored calendar date, whatever timezone you read it in.
 */

/** A calendar day with no time and no timezone, formatted `YYYY-MM-DD`. */
export type CivilDate = string;

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertCivil(date: CivilDate): void {
  if (!CIVIL_DATE.test(date)) {
    throw new RangeError(`Not a YYYY-MM-DD civil date: ${date}`);
  }
}

/**
 * A civil date anchored to UTC **noon**. Used both for day arithmetic (so adding
 * days can never trip over a daylight-saving transition, which only ever moves
 * the clock near midnight) and as the display anchor for formatting a civil date
 * with `Intl` + `timeZone: "UTC"`, which reads back the exact same date.
 */
export function civilToUtcNoon(date: CivilDate): Date {
  assertCivil(date);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function utcToCivil(instant: Date): CivilDate {
  const year = instant.getUTCFullYear().toString().padStart(4, "0");
  const month = (instant.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = instant.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The civil date `days` after `date` (negative goes backward). */
export function addDays(date: CivilDate, days: number): CivilDate {
  return utcToCivil(new Date(civilToUtcNoon(date).getTime() + days * DAY_MS));
}

/**
 * Whole civil days from `from` to `to` (both `YYYY-MM-DD`), signed — negative
 * when `to` is earlier. Anchored to UTC noon so a daylight-saving transition
 * near midnight can never skew the count. Used to place an event relative to the
 * forecast horizon (weather degrade, re-plan nudge).
 */
export function civilDaysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round(
    (civilToUtcNoon(to).getTime() - civilToUtcNoon(from).getTime()) / DAY_MS,
  );
}

/**
 * The Monday of the week containing `date`. Weeks are Monday→Sunday, so a date
 * that already is a Monday returns itself and a Sunday returns the Monday six
 * days earlier.
 */
export function mondayOf(date: CivilDate): CivilDate {
  // getUTCDay: 0=Sun..6=Sat. Days since the most recent Monday: Mon→0 … Sun→6.
  const sinceMonday = (civilToUtcNoon(date).getUTCDay() + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** The seven civil dates Monday→Sunday for the week starting at `monday`. */
export function weekDates(monday: CivilDate): CivilDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/**
 * The Monday of the week `weekOffset` weeks from the one containing `today`
 * (0 = current week, -1 = last week, +1 = next week).
 */
export function weekStartFor(today: CivilDate, weekOffset: number): CivilDate {
  return mondayOf(addDays(today, weekOffset * 7));
}

/** True when `date` falls strictly before `today` (a read-only past day). */
export function isPastDate(date: CivilDate, today: CivilDate): boolean {
  assertCivil(date);
  assertCivil(today);
  return date < today;
}

/** The civil date of `instant` as read in `timeZone` (an IANA zone name). */
export function civilDateInTimeZone(instant: Date, timeZone: string): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The civil date an event belongs to in the agenda. A timed event buckets by the
 * viewer's timezone; an all-day event is date-only (stored at UTC midnight) and
 * buckets by its UTC calendar date regardless of where it is read.
 */
export function eventCivilDate(
  event: { startsAt: string | Date; allDay: boolean },
  viewerTimeZone: string,
): CivilDate {
  const startsAt =
    event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
  return event.allDay
    ? civilDateInTimeZone(startsAt, "UTC")
    : civilDateInTimeZone(startsAt, viewerTimeZone);
}

/**
 * An instant range that is a **superset** of the given Monday-start week in any
 * timezone, for the events range query. Bucketing on the client is authoritative
 * and precise; this only has to over-fetch, so it pads a full day on each side —
 * comfortably beyond the ±14h of real-world UTC offsets — and hands back ISO
 * instants ready for the `from`/`to` query params.
 */
export function weekInstantRange(monday: CivilDate): { from: string; to: string } {
  return {
    from: `${addDays(monday, -1)}T00:00:00.000Z`,
    to: `${addDays(monday, 8)}T00:00:00.000Z`,
  };
}
