import "server-only";

/**
 * Place resolution via **Open-Meteo geocoding** — the calendar's first outside
 * contact, reached only after the Smart Planning consent boundary allows egress.
 *
 * Open-Meteo's `/v1/search` is a GeoNames **place-name** index, not a freeform
 * or point-of-interest parser, so a raw "beachside restaurant, Bandra" won't
 * resolve as-is. Three rules make it honest (spec §2):
 *
 *   1. **Preprocess** the freeform text into candidate place tokens (comma
 *      segments, most-specific first).
 *   2. **Disambiguate** the results for a token by the user's region hint or
 *      highest population — never a blind `results[0]`, so a tiny "Bandra" in
 *      Rajasthan can't outrank Mumbai's.
 *   3. **Coarsen** progressively: try the most specific token, and on no match
 *      drop to the next-coarser one (venue → neighbourhood → city). When a
 *      coarser token wins we mark the result `approximate` so the UI can say
 *      "couldn't pinpoint that place, using <city>" rather than guess silently.
 *      When nothing resolves we say so and store no coordinates — never a guess.
 *
 * The event **title is never passed here** — only `placeText`-derived tokens
 * reach the network. That privacy invariant is structural: the function simply
 * has no parameter through which a title could travel.
 */

const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

/** One candidate place from Open-Meteo's search results. Only the fields we use
 *  are typed; the payload carries more. */
export type OpenMeteoPlace = {
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string | null;
  country?: string | null;
  admin1?: string | null;
  admin2?: string | null;
  admin3?: string | null;
  population?: number | null;
};

/** The canonical, storable resolution of a place: what gets cached on the event
 *  (`latitude`/`longitude`/`timezone`/`placeLabel`). */
export type ResolvedPlace = {
  latitude: number;
  longitude: number;
  timezone: string | null;
  placeLabel: string;
};

export type GeocodeOutcome =
  | { status: "resolved"; place: ResolvedPlace; approximate: boolean }
  | { status: "unresolved" };

/** Fold a string for accent-, case-, and punctuation-insensitive comparison. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Split freeform place text into candidate place tokens, **most-specific first**
 * and de-duplicated. A typical entry reads venue-first ("beachside restaurant,
 * Bandra, Mumbai"), so the natural comma order already runs specific → coarse,
 * which is exactly the order the coarsening loop wants.
 */
export function placeTokens(placeText: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of placeText.split(",")) {
    const token = raw.trim();
    if (token.length === 0) continue;
    const key = fold(token);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

/**
 * Choose the best match among a token's results — **never a blind `results[0]`**.
 * A result whose region text (admin areas / country) contains one of the coarser
 * `hints` wins outright; among the rest, the most populous wins, which is what
 * keeps a major city ahead of a same-named village. Returns `null` when there is
 * nothing to choose from — the `results` key is omitted entirely on no match, so
 * an absent or empty array must be handled, not indexed.
 */
export function pickBestPlace(
  results: OpenMeteoPlace[] | null | undefined,
  hints: string[] = [],
): OpenMeteoPlace | null {
  if (!Array.isArray(results) || results.length === 0) return null;

  const foldedHints = hints.map(fold).filter((hint) => hint.length > 0);

  let best: OpenMeteoPlace | null = null;
  let bestScore = -Infinity;
  for (const place of results) {
    const regionText = fold(
      [place.admin1, place.admin2, place.admin3, place.country]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    );
    const regionMatch = foldedHints.some(
      (hint) => regionText.length > 0 && regionText.includes(hint),
    );
    const population = typeof place.population === "number" ? place.population : 0;
    // A region-hint match dominates; population is the tiebreak and the sole
    // ranking signal when no hint is given. The strict `>` keeps the first of an
    // exact tie, but a tie only happens between equally-unhinted, equally-
    // populous candidates — never the "took results[0] regardless" the rule bans.
    const score = (regionMatch ? Number.MAX_SAFE_INTEGER : 0) + population;
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return best;
}

/** A human-readable canonical label: the place name plus its coarsest region for
 *  disambiguation ("Bandra, Maharashtra"), collapsing to just the name when the
 *  region would be redundant. */
function buildLabel(place: OpenMeteoPlace): string {
  const region = place.admin1 ?? place.country ?? null;
  if (!region || fold(region) === fold(place.name)) return place.name;
  return `${place.name}, ${region}`;
}

/** Fetch one token's geocoding results, or `null` on any failure / no match. */
async function fetchGeocoding(
  token: string,
  signal?: AbortSignal,
): Promise<OpenMeteoPlace[] | null> {
  const url = new URL(GEOCODING_ENDPOINT);
  // `token` is a placeText-derived segment — never the event title.
  url.searchParams.set("name", token);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  const json = (await response.json().catch(() => null)) as
    | { results?: OpenMeteoPlace[] }
    | null;
  // The `results` key is omitted (not `[]`) when nothing matches, so guard the
  // shape rather than indexing into it.
  return Array.isArray(json?.results) ? json.results : null;
}

/**
 * Resolve freeform `placeText` to storable coordinates, coarsening on failure.
 * Walks the tokens most-specific → coarsest; the first token that yields a pick
 * wins. Coarser tokens after the current one bias disambiguation as region
 * hints. A win on any but the most-specific token is flagged `approximate`.
 * Returns `{ status: "unresolved" }` — never a guess — when no token resolves.
 */
export async function geocodePlace(
  placeText: string,
  signal?: AbortSignal,
): Promise<GeocodeOutcome> {
  const tokens = placeTokens(placeText);
  if (tokens.length === 0) return { status: "unresolved" };

  for (let index = 0; index < tokens.length; index++) {
    const hints = tokens.slice(index + 1);
    const results = await fetchGeocoding(tokens[index], signal);
    const place = pickBestPlace(results, hints);
    if (place) {
      return {
        status: "resolved",
        approximate: index > 0,
        place: {
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: place.timezone ?? null,
          placeLabel: buildLabel(place),
        },
      };
    }
  }
  return { status: "unresolved" };
}
