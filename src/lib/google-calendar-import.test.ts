import { describe, expect, it } from "bun:test";

import {
  GOOGLE_CALENDAR_LOOKAHEAD_DAYS,
  GOOGLE_EVENT_FALLBACK_TITLE,
  googleSyncWindow,
  mapGoogleEvent,
  toImportRecords,
  type GoogleCalendarEvent,
  type GoogleSyncWindow,
} from "@/lib/google-calendar-import";

/**
 * Pure mapping tests for the Google Calendar import — the seam the spec calls
 * out because the live path can't run in Clerk keyless dev. They pin the four
 * decided behaviours: the timed-vs-all-day branch, the cancelled skip, the
 * forward-only-from-today range, and (through the sync route's upsert) the
 * `externalId` identity these records carry.
 */

// A fixed "start of today" so the range assertions are deterministic.
const START_OF_TODAY = new Date("2026-08-12T00:00:00.000Z");
const WINDOW: GoogleSyncWindow = googleSyncWindow(START_OF_TODAY);

function timed(overrides: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: "evt-timed",
    summary: "Dinner with Sam",
    location: "Bandra, Mumbai",
    status: "confirmed",
    start: { dateTime: "2026-08-14T19:30:00+05:30" },
    end: { dateTime: "2026-08-14T21:00:00+05:30" },
    ...overrides,
  };
}

describe("googleSyncWindow", () => {
  it("spans start-of-today to the bounded lookahead, forward-only", () => {
    expect(WINDOW.timeMin.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    const days =
      (WINDOW.timeMax.getTime() - WINDOW.timeMin.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(GOOGLE_CALENDAR_LOOKAHEAD_DAYS);
  });

  it("honours an explicit lookahead", () => {
    const w = googleSyncWindow(START_OF_TODAY, 7);
    expect(w.timeMax.toISOString()).toBe("2026-08-19T00:00:00.000Z");
  });
});

describe("mapGoogleEvent — timed events", () => {
  it("maps summary→title, location→placeText, and the timed instants", () => {
    const record = mapGoogleEvent(timed(), WINDOW);
    expect(record).not.toBeNull();
    expect(record!.externalId).toBe("evt-timed");
    expect(record!.title).toBe("Dinner with Sam");
    expect(record!.placeText).toBe("Bandra, Mumbai");
    expect(record!.allDay).toBe(false);
    // The +05:30 offset is honoured — stored as the correct absolute instant.
    expect(record!.startsAt.toISOString()).toBe("2026-08-14T14:00:00.000Z");
    expect(record!.endsAt!.toISOString()).toBe("2026-08-14T15:30:00.000Z");
  });

  it("keeps endsAt null when the event has no end", () => {
    const record = mapGoogleEvent(timed({ end: undefined }), WINDOW);
    expect(record!.endsAt).toBeNull();
  });

  it("falls back to a placeholder title for an empty summary", () => {
    expect(mapGoogleEvent(timed({ summary: "" }), WINDOW)!.title).toBe(
      GOOGLE_EVENT_FALLBACK_TITLE,
    );
    expect(mapGoogleEvent(timed({ summary: null }), WINDOW)!.title).toBe(
      GOOGLE_EVENT_FALLBACK_TITLE,
    );
  });

  it("maps a missing/blank location to a null placeText", () => {
    expect(mapGoogleEvent(timed({ location: undefined }), WINDOW)!.placeText).toBeNull();
    expect(mapGoogleEvent(timed({ location: "   " }), WINDOW)!.placeText).toBeNull();
  });
});

describe("mapGoogleEvent — all-day events", () => {
  it("branches on `date`, pins UTC midnight, and stores no end", () => {
    const record = mapGoogleEvent(
      timed({
        id: "evt-allday",
        start: { date: "2026-08-15" },
        end: { date: "2026-08-16" }, // Google's end.date is exclusive
      }),
      WINDOW,
    );
    expect(record!.allDay).toBe(true);
    expect(record!.startsAt.toISOString()).toBe("2026-08-15T00:00:00.000Z");
    expect(record!.endsAt).toBeNull();
  });
});

describe("mapGoogleEvent — skips", () => {
  it("skips a cancelled event", () => {
    expect(mapGoogleEvent(timed({ status: "cancelled" }), WINDOW)).toBeNull();
  });

  it("skips an event with no id", () => {
    expect(mapGoogleEvent(timed({ id: undefined }), WINDOW)).toBeNull();
    expect(mapGoogleEvent(timed({ id: "  " }), WINDOW)).toBeNull();
  });

  it("skips an event with no placeable start", () => {
    expect(mapGoogleEvent(timed({ start: undefined }), WINDOW)).toBeNull();
    expect(mapGoogleEvent(timed({ start: {} }), WINDOW)).toBeNull();
  });

  it("skips an unparseable date", () => {
    expect(mapGoogleEvent(timed({ start: { dateTime: "not-a-date" } }), WINDOW)).toBeNull();
    expect(mapGoogleEvent(timed({ start: { date: "2026-13-40" } }), WINDOW)).toBeNull();
  });
});

describe("mapGoogleEvent — forward-only range", () => {
  it("skips an event that started before today", () => {
    const past = timed({
      start: { dateTime: "2026-08-11T10:00:00.000Z" },
      end: { dateTime: "2026-08-11T11:00:00.000Z" },
    });
    expect(mapGoogleEvent(past, WINDOW)).toBeNull();
  });

  it("keeps an event that starts exactly at start-of-today", () => {
    const today = timed({
      start: { dateTime: "2026-08-12T00:00:00.000Z" },
      end: { dateTime: "2026-08-12T01:00:00.000Z" },
    });
    expect(mapGoogleEvent(today, WINDOW)).not.toBeNull();
  });

  it("skips an event at or beyond the lookahead horizon", () => {
    const beyond = timed({
      start: { date: "2026-09-11" }, // == timeMax (30 days out), exclusive
    });
    expect(mapGoogleEvent(beyond, WINDOW)).toBeNull();
  });

  it("skips an all-day event on a past day", () => {
    const pastAllDay = timed({ start: { date: "2026-08-10" }, end: { date: "2026-08-11" } });
    expect(mapGoogleEvent(pastAllDay, WINDOW)).toBeNull();
  });
});

describe("toImportRecords", () => {
  it("keeps only the mappable, in-range events and preserves order", () => {
    const events: GoogleCalendarEvent[] = [
      timed({ id: "a" }),
      timed({ id: "b", status: "cancelled" }),
      timed({ id: "c", start: { dateTime: "2026-08-01T10:00:00.000Z" } }), // past
      timed({ id: "d", start: { date: "2026-08-20" }, end: { date: "2026-08-21" } }),
    ];
    const records = toImportRecords(events, WINDOW);
    expect(records.map((r) => r.externalId)).toEqual(["a", "d"]);
  });

  it("returns an empty list for no input", () => {
    expect(toImportRecords([], WINDOW)).toEqual([]);
  });
});
