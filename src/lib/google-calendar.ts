import {
  toImportRecords,
  type GoogleCalendarEvent,
  type GoogleEventImportRecord,
  type GoogleSyncWindow,
} from "@/lib/google-calendar-import";

/**
 * The server-side network boundary for the read-only Google Calendar import: it
 * lists the caller's primary-calendar events with an access token Clerk minted,
 * pages through the results, and hands the raw items to the pure mapper. The
 * access token is used and discarded — never persisted (Clerk holds the refresh
 * token; AURA stores none of it). The decisions about which events to keep and
 * how to shape them live in `google-calendar-import.ts`; this file only fetches.
 *
 * Route handlers mock this module at its boundary, so the pure mapper's branches
 * stay tested through it while the network call itself is stubbed.
 */

const CALENDAR_EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// `singleEvents=true` is required to use `orderBy=startTime` (it expands
// recurring events into individual instances); `fields` narrows the payload to
// exactly what the mapper reads.
const EVENT_FIELDS =
  "nextPageToken,items(id,summary,location,status,start,end)";
const PAGE_SIZE = 250;

// A hard cap on pages so a pathological calendar can't page forever. At 250
// events/page over a ~30-day window this is far more than any real account
// reaches; the bound is a safety valve, not an expected limit.
const MAX_PAGES = 10;

/** Why a calendar fetch failed, mapped to an HTTP response by the route.
 *  `unauthorized` means the token is missing the calendar scope (or is invalid)
 *  and the user must reconnect; `unavailable` is a transient Google/network fault. */
export type GoogleCalendarErrorKind = "unauthorized" | "unavailable";

export class GoogleCalendarError extends Error {
  readonly kind: GoogleCalendarErrorKind;
  constructor(kind: GoogleCalendarErrorKind, message: string) {
    super(message);
    this.name = "GoogleCalendarError";
    this.kind = kind;
  }
}

type EventsPage = {
  items?: GoogleCalendarEvent[] | null;
  nextPageToken?: string | null;
  timeZone?: string | null;
};

/**
 * List the primary calendar's events across the forward-only window, following
 * `nextPageToken` to completion (bounded by `MAX_PAGES`). Returns the mapped,
 * in-range import records — the caller upserts them by `externalId`.
 */
export async function listPrimaryCalendarEvents(
  accessToken: string,
  window: GoogleSyncWindow,
): Promise<GoogleEventImportRecord[]> {
  const raw: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(CALENDAR_EVENTS_ENDPOINT);
    url.searchParams.set("timeMin", window.timeMin.toISOString());
    url.searchParams.set("timeMax", window.timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    url.searchParams.set("fields", EVENT_FIELDS);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (error) {
      throw new GoogleCalendarError(
        "unavailable",
        `Google Calendar request failed: ${String(error)}`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new GoogleCalendarError(
        "unauthorized",
        `Google Calendar denied the request (${response.status}).`,
      );
    }
    if (!response.ok) {
      throw new GoogleCalendarError(
        "unavailable",
        `Google Calendar returned ${response.status}.`,
      );
    }

    const body = (await response.json().catch(() => null)) as EventsPage | null;
    if (!body) {
      throw new GoogleCalendarError("unavailable", "Google Calendar sent an unreadable response.");
    }

    if (Array.isArray(body.items)) raw.push(...body.items);

    pageToken = body.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return toImportRecords(raw, window);
}
