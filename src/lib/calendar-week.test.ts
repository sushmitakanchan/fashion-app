import { describe, expect, it } from "bun:test";

import {
  addDays,
  civilDateInTimeZone,
  eventCivilDate,
  isPastDate,
  mondayOf,
  weekDates,
  weekInstantRange,
  weekStartFor,
} from "./calendar-week";

describe("addDays", () => {
  it("moves forward and backward across month and year boundaries", () => {
    expect(addDays("2026-08-10", 1)).toBe("2026-08-11");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-08-10", 0)).toBe("2026-08-10");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("does not drift across a spring-forward DST transition", () => {
    // US DST began 2026-03-08. Stepping a full week over it stays exact because
    // the arithmetic is anchored to UTC noon, far from the midnight shift.
    expect(addDays("2026-03-07", 7)).toBe("2026-03-14");
  });
});

describe("mondayOf", () => {
  it("returns the Monday of the containing week", () => {
    // 2026-08-10 is a Monday.
    expect(mondayOf("2026-08-10")).toBe("2026-08-10");
    // Tue..Sun all resolve back to that Monday.
    expect(mondayOf("2026-08-11")).toBe("2026-08-10");
    expect(mondayOf("2026-08-16")).toBe("2026-08-10"); // Sunday
    // The day before is the prior Monday.
    expect(mondayOf("2026-08-09")).toBe("2026-08-03"); // Sunday → prior Monday
  });
});

describe("weekDates", () => {
  it("lists Monday through Sunday", () => {
    expect(weekDates("2026-08-10")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });
});

describe("weekStartFor", () => {
  it("offsets whole weeks from the week containing today", () => {
    expect(weekStartFor("2026-08-12", 0)).toBe("2026-08-10"); // this week
    expect(weekStartFor("2026-08-12", -1)).toBe("2026-08-03"); // last week
    expect(weekStartFor("2026-08-12", 1)).toBe("2026-08-17"); // next week
  });
});

describe("isPastDate", () => {
  it("is true strictly before today and false for today or later", () => {
    expect(isPastDate("2026-08-09", "2026-08-10")).toBe(true);
    expect(isPastDate("2026-08-10", "2026-08-10")).toBe(false); // today is active
    expect(isPastDate("2026-08-11", "2026-08-10")).toBe(false);
  });
});

describe("civilDateInTimeZone", () => {
  it("reads the same instant as a different calendar date per timezone", () => {
    // 2:30am UTC is still the previous evening in New York.
    const instant = new Date("2026-08-10T02:30:00.000Z");
    expect(civilDateInTimeZone(instant, "UTC")).toBe("2026-08-10");
    expect(civilDateInTimeZone(instant, "America/New_York")).toBe("2026-08-09");
    expect(civilDateInTimeZone(instant, "Asia/Kolkata")).toBe("2026-08-10");
  });
});

describe("eventCivilDate", () => {
  it("buckets a timed event by the viewer's timezone", () => {
    // A 9pm-local event in New York is the next day in UTC; the viewer sees it
    // on their own local date.
    const event = { startsAt: "2026-08-11T01:00:00.000Z", allDay: false };
    expect(eventCivilDate(event, "America/New_York")).toBe("2026-08-10");
    expect(eventCivilDate(event, "Asia/Kolkata")).toBe("2026-08-11");
  });

  it("buckets an all-day event by its stored UTC date regardless of viewer", () => {
    // All-day events are stored at UTC midnight and are date-only: the same
    // calendar day everywhere, never shifted by the reader's offset.
    const event = { startsAt: "2026-08-11T00:00:00.000Z", allDay: true };
    expect(eventCivilDate(event, "America/New_York")).toBe("2026-08-11");
    expect(eventCivilDate(event, "Pacific/Auckland")).toBe("2026-08-11");
    expect(eventCivilDate(event, "UTC")).toBe("2026-08-11");
  });

  it("accepts a Date as well as an ISO string", () => {
    const event = { startsAt: new Date("2026-08-10T12:00:00.000Z"), allDay: false };
    expect(eventCivilDate(event, "UTC")).toBe("2026-08-10");
  });
});

describe("weekInstantRange", () => {
  it("brackets the week with a day of padding on each side", () => {
    // Week is Mon 2026-08-10 → Sun 2026-08-16. The range pads to the day before
    // Monday and the day after the following Monday so any viewer timezone's
    // local week is fully covered by the query.
    expect(weekInstantRange("2026-08-10")).toEqual({
      from: "2026-08-09T00:00:00.000Z",
      to: "2026-08-18T00:00:00.000Z",
    });
  });

  it("produces valid, ordered ISO instants", () => {
    const { from, to } = weekInstantRange("2026-12-28");
    expect(new Date(from).toISOString()).toBe(from);
    expect(new Date(to).toISOString()).toBe(to);
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });
});
