/**
 * Display-only shortening of an event's place text.
 *
 * `placeText` is whatever the event carries: something a person typed
 * ("Helen's place"), or a full postal address imported from Google
 * ("42 Turner Rd, Bandra West, Mumbai, Maharashtra 400050, India"). The ticket
 * shows one line, so it shows the *place* — the rest stays available as the
 * field's title.
 *
 * This never touches what is stored or what is geocoded. Weather still resolves
 * against the full text, so shortening the label can't move a forecast.
 */

/** A leading segment that is a street line rather than a place: "42 Turner Rd",
 *  "Flat 3B", "Plot 17". Postal addresses lead with these; names don't. */
const STREET_LINE = /^(?:\d|(?:flat|apt|apartment|unit|suite|shop|plot|no\.?|#)\b)/i;

/**
 * The first segment of `placeText` that names a place, or the whole string when
 * there is nothing to cut. Returns `null` for blank input.
 */
export function shortPlaceLabel(placeText: string | null | undefined): string | null {
  if (!placeText) return null;

  const segments = placeText
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return null;
  if (segments.length === 1) return segments[0];

  // A postal address leads with the street line, which identifies the building
  // rather than the place — step past it to the neighbourhood or venue. Only one
  // step: "42 Turner Rd, Bandra West, Mumbai" is Bandra West, not Mumbai.
  if (STREET_LINE.test(segments[0]) && segments[1]) return segments[1];

  return segments[0];
}
