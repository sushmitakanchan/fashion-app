import { describe, expect, it } from "bun:test";

import { eventsClash, findClashes } from "@/lib/calendar-clash";

const timed = (startsAt: string, endsAt: string | null = null) => ({
  startsAt,
  endsAt,
  allDay: false,
});

const allDay = (startsAt: string) => ({ startsAt, endsAt: null, allDay: true });

describe("eventsClash", () => {
  it("clashes when two timed intervals overlap", () => {
    expect(
      eventsClash(
        timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z"),
        timed("2026-08-19T12:30:00Z", "2026-08-19T13:30:00Z"),
      ),
    ).toBe(true);
  });

  it("does not clash when intervals only touch at a boundary", () => {
    // 12–1 then 1–2: half-open intervals, so the shared 1:00 instant is not an overlap.
    expect(
      eventsClash(
        timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z"),
        timed("2026-08-19T13:00:00Z", "2026-08-19T14:00:00Z"),
      ),
    ).toBe(false);
  });

  it("does not clash for disjoint intervals", () => {
    expect(
      eventsClash(
        timed("2026-08-19T09:00:00Z", "2026-08-19T10:00:00Z"),
        timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z"),
      ),
    ).toBe(false);
  });

  it("treats an open-ended event as a point, clashing only strictly inside another", () => {
    const inside = timed("2026-08-19T12:30:00Z"); // no end → point at 12:30
    const around = timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z");
    expect(eventsClash(inside, around)).toBe(true);
    expect(eventsClash(around, inside)).toBe(true); // symmetric
  });

  it("a point at another event's exact start or end does not clash", () => {
    const around = timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z");
    expect(eventsClash(timed("2026-08-19T12:00:00Z"), around)).toBe(false);
    expect(eventsClash(timed("2026-08-19T13:00:00Z"), around)).toBe(false);
  });

  it("two points never clash, even at the same instant", () => {
    expect(
      eventsClash(timed("2026-08-19T12:00:00Z"), timed("2026-08-19T12:00:00Z")),
    ).toBe(false);
  });

  it("an all-day event never participates, on either side", () => {
    const overlappingInstant = timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z");
    expect(eventsClash(allDay("2026-08-19T00:00:00Z"), overlappingInstant)).toBe(false);
    expect(eventsClash(overlappingInstant, allDay("2026-08-19T00:00:00Z"))).toBe(false);
  });

  it("compares absolute instants, so timezone offsets are respected", () => {
    // 12:00-04:00 (16:00Z) vs 15:00Z–17:00Z overlap in instant space.
    expect(
      eventsClash(
        timed("2026-08-19T12:00:00-04:00", "2026-08-19T13:00:00-04:00"),
        timed("2026-08-19T15:30:00Z", "2026-08-19T17:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("findClashes", () => {
  const existing = [
    { id: "a", title: "Meetup", ...timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z") },
    { id: "b", title: "Gym", ...timed("2026-08-19T18:00:00Z", "2026-08-19T19:00:00Z") },
    { id: "c", title: "Birthday", ...allDay("2026-08-19T00:00:00Z") },
  ];

  it("returns the neighbours a candidate overlaps, naming them", () => {
    const clashes = findClashes(
      timed("2026-08-19T12:30:00Z", "2026-08-19T14:00:00Z"),
      existing,
    );
    expect(clashes.map((c) => c.title)).toEqual(["Meetup"]);
  });

  it("excludes the event being edited from its own clash set", () => {
    const clashes = findClashes(
      timed("2026-08-19T12:00:00Z", "2026-08-19T13:00:00Z"),
      existing,
      "a",
    );
    expect(clashes).toEqual([]);
  });

  it("an all-day candidate clashes with nothing", () => {
    expect(findClashes(allDay("2026-08-19T00:00:00Z"), existing)).toEqual([]);
  });

  it("never reports an all-day neighbour as a clash", () => {
    const clashes = findClashes(
      timed("2026-08-19T09:00:00Z", "2026-08-19T23:00:00Z"),
      existing,
    );
    expect(clashes.map((c) => c.title)).toEqual(["Meetup", "Gym"]);
  });
});
