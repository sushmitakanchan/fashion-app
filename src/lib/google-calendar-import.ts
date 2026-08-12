/**
 * Pure mapping logic for the read-only Google Calendar import — no network, no
 * Prisma, no Clerk. Given the raw items the Google Calendar API returns, it
 * produces the normalized records the sync route upserts. This is the seam the
 * spec singles out for unit tests (the Google path can't be exercised in Clerk
 * keyless dev), so every branch it decides — timed vs all-day, cancelled skip,
 * forward-only range, the `summary`/`location` mapping — lives here and is
 * covered directly.
 *
 * The network fetch that hands us these items lives in `google-calendar.ts`; the
 * upsert-by-`externalId` that consumes these records lives in the sync route.
 */

/** How far forward one sync looks, from start-of-today. A tuning detail, not a
 *  contract — bounded so a calendar with events years out doesn't page forever.
 *  Well inside Google's own event horizon; re-sync on-open keeps it fresh. */
export const GOOGLE_CALENDAR_LOOKAHEAD_DAYS = 30;

/** The title used when a Google event has no `summary` (Google permits it). */
export const GOOGLE_EVENT_FALLBACK_TITLE = "(untitled event)";

/** One `start`/`end` on a Google event: either a timed instant (`dateTime`, an
 *  RFC3339 string carrying its own offset) or an all-day `date` (YYYY-MM-DD). */
export type GoogleCalendarEventTime = {
  dateTime?: string | null;
  date?: string | null;
  timeZone?: string | null;
};

/** The subset of a Google Calendar event we request (`fields=…items(id,summary,
 *  location,status,start,end)`). Everything is optional but `id` — a resilient
 *  parser tolerates a sparse item rather than trusting the shape. */
export type GoogleCalendarEvent = {
  id?: string | null;
  summary?: string | null;
  location?: string | null;
  status?: string | null;
  start?: GoogleCalendarEventTime | null;
  end?: GoogleCalendarEventTime | null;
};

/** A normalized event ready to upsert onto `PlannedEvent`. `startsAt`/`endsAt`
 *  are absolute instants; `allDay` records the branch; geocoded fields are left
 *  for a later consent-gated step (never filled here). */
export type GoogleEventImportRecord = {
  externalId: string;
  title: string;
  placeText: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
};

/** The forward-only instant window a sync pulls: `[timeMin, timeMax)`, matching
 *  the Google API's `timeMin`/`timeMax` query params. */
export type GoogleSyncWindow = { timeMin: Date; timeMax: Date };

/**
 * The forward-only sync window: from start-of-today (an instant the caller
 * resolves in the viewer's timezone) to a bounded lookahead. No history is ever
 * pulled — the calendar's own timeline is the archive, and re-sync on-open keeps
 * upcoming events fresh.
 */
export function googleSyncWindow(
  startOfToday: Date,
  lookaheadDays: number = GOOGLE_CALENDAR_LOOKAHEAD_DAYS,
): GoogleSyncWindow {
  const timeMax = new Date(startOfToday.getTime());
  timeMax.setUTCDate(timeMax.getUTCDate() + lookaheadDays);
  return { timeMin: new Date(startOfToday.getTime()), timeMax };
}

function cleaned(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * Parse one event's `start`/`end` into absolute instants and the all-day branch.
 * Returns `null` for a shape we can't place: a missing/malformed start, or a
 * timed/all-day value that doesn't parse. `filterStart` is the instant the range
 * filter keys off; `endsAt` is what we persist (null for all-day — the agenda
 * buckets all-day events by their start date and renders them "All day", so an
 * exclusive Google end date would only risk an off-by-one span).
 */
function parseWhen(
  start: GoogleCalendarEventTime | null | undefined,
  end: GoogleCalendarEventTime | null | undefined,
): { startsAt: Date; endsAt: Date | null; allDay: boolean; filterStart: Date } | null {
  if (!start) return null;

  // Timed: `dateTime` is RFC3339 with an offset, so `Date` yields the correct
  // absolute instant without needing the optional `timeZone` hint.
  const startDateTime = cleaned(start.dateTime);
  if (startDateTime) {
    const startsAt = new Date(startDateTime);
    if (!isValidDate(startsAt)) return null;
    const endDateTime = cleaned(end?.dateTime);
    const endsAt = endDateTime ? new Date(endDateTime) : null;
    if (endsAt && !isValidDate(endsAt)) return null;
    return { startsAt, endsAt, allDay: false, filterStart: startsAt };
  }

  // All-day: `date` is YYYY-MM-DD, pinned to UTC midnight so it reads as the same
  // calendar day everywhere — the same convention the manual all-day path uses.
  const startDate = cleaned(start.date);
  if (startDate) {
    const startsAt = new Date(`${startDate}T00:00:00.000Z`);
    if (!isValidDate(startsAt)) return null;
    return { startsAt, endsAt: null, allDay: true, filterStart: startsAt };
  }

  return null;
}

/**
 * Map one raw Google event to an import record, or `null` to skip it. Skips:
 * cancelled events, events without an id (nothing to upsert on), events we can't
 * place in time, and events whose start falls outside the forward-only window.
 * Maps `summary → title` (with a fallback for an empty summary) and
 * `location → placeText`.
 */
export function mapGoogleEvent(
  event: GoogleCalendarEvent,
  window: GoogleSyncWindow,
): GoogleEventImportRecord | null {
  if (event.status === "cancelled") return null;

  const externalId = cleaned(event.id);
  if (!externalId) return null;

  const when = parseWhen(event.start, event.end);
  if (!when) return null;

  // Forward-only from start-of-today, within the lookahead. An event that
  // started before today isn't imported — you plan outfits for what's ahead.
  const startMs = when.filterStart.getTime();
  if (startMs < window.timeMin.getTime() || startMs >= window.timeMax.getTime()) {
    return null;
  }

  return {
    externalId,
    title: cleaned(event.summary) ?? GOOGLE_EVENT_FALLBACK_TITLE,
    placeText: cleaned(event.location),
    startsAt: when.startsAt,
    endsAt: when.endsAt,
    allDay: when.allDay,
  };
}

/**
 * Map a page (or the concatenation of paged results) of raw Google events to the
 * import records the sync route upserts, dropping everything `mapGoogleEvent`
 * skips. Order is preserved; de-duplication by `externalId` is the upsert's job.
 */
export function toImportRecords(
  events: readonly GoogleCalendarEvent[],
  window: GoogleSyncWindow,
): GoogleEventImportRecord[] {
  const records: GoogleEventImportRecord[] = [];
  for (const event of events) {
    const record = mapGoogleEvent(event, window);
    if (record) records.push(record);
  }
  return records;
}
