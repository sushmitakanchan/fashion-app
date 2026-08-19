/**
 * Time-clash detection for planned events — pure interval math, no timezone
 * library and no I/O, so it runs identically in the browser pre-check and the
 * authoritative server guard.
 *
 * The rule (spec: warn on an accidental double-book, never block a deliberate
 * one — see the calendar surface's clash prompt):
 *
 *   - Two **timed** events clash when their instant intervals overlap:
 *     `startA < endB && startB < endA`. Touching boundaries (12–1 then 1–2) do
 *     NOT clash — the intervals are half-open `[start, end)`.
 *   - An **all-day** event is a day-marker, not a time block, so it never
 *     participates — neither as the candidate nor as an existing neighbour.
 *   - An **open-ended** event (no `endsAt`) is a zero-length point, so it clashes
 *     only when it falls *strictly inside* another event's interval.
 *
 * Everything compares absolute instants, so it is timezone-independent: a value
 * may be an ISO string or a `Date`.
 */

/** The minimal shape clash math needs from an event. */
export type ClashInterval = {
  startsAt: string | Date;
  endsAt: string | Date | null;
  allDay: boolean;
};

/** An existing event, carried through so a clash can name what it hit. */
export type ClashNeighbour = ClashInterval & { id: string; title: string };

/**
 * The half-open instant interval `[start, end)` an event occupies, in epoch ms —
 * or `null` when the event doesn't participate in clash detection (an all-day
 * day-marker). An open-ended event collapses to a point (`start === end`).
 */
function instantInterval(event: ClashInterval): { start: number; end: number } | null {
  if (event.allDay) return null;
  const start = new Date(event.startsAt).getTime();
  if (Number.isNaN(start)) return null;
  const rawEnd = event.endsAt ? new Date(event.endsAt).getTime() : start;
  const end = Number.isNaN(rawEnd) ? start : rawEnd;
  return { start, end };
}

/** True when two events occupy overlapping time. See the module rule. */
export function eventsClash(a: ClashInterval, b: ClashInterval): boolean {
  const ia = instantInterval(a);
  const ib = instantInterval(b);
  if (!ia || !ib) return false;
  // Half-open overlap. For a point (start === end) this reduces to "strictly
  // inside the other interval", and two points never clash — both intended.
  return ia.start < ib.end && ib.start < ia.end;
}

/**
 * The existing events that clash with `candidate`, in the order given. Pass the
 * edited event's id as `excludeId` so an in-place edit never clashes with itself.
 */
export function findClashes<E extends ClashNeighbour>(
  candidate: ClashInterval,
  existing: readonly E[],
  excludeId?: string,
): E[] {
  if (candidate.allDay) return [];
  return existing.filter(
    (event) => event.id !== excludeId && eventsClash(candidate, event),
  );
}
