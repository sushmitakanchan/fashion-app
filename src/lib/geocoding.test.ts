import { describe, expect, it, mock } from "bun:test";

import type { OpenMeteoPlace } from "@/lib/geocoding";

// `@/lib/geocoding` is `server-only`; neutralise the guard, then import the
// module under test dynamically so the mock is registered first (static imports
// hoist above it). Repo convention — see `wardrobe-analysis.test.ts`.
mock.module("server-only", () => ({}));

const { pickBestPlace, placeTokens } = await import("@/lib/geocoding");

/**
 * Pure-logic coverage for the geocoding disambiguation the spec (§2) calls out:
 * token preprocessing, region/population disambiguation (never a blind
 * `results[0]`), and the no-`results`-key guard. The network coarsening loop
 * (`geocodePlace`) is exercised end-to-end — including that the title never
 * egresses — from the weather route's test with a stubbed `fetch`.
 */

const place = (over: Partial<OpenMeteoPlace> & { name: string }): OpenMeteoPlace => ({
  latitude: 0,
  longitude: 0,
  ...over,
});

describe("placeTokens", () => {
  it("splits comma segments, trimmed and most-specific first", () => {
    expect(placeTokens("beachside restaurant, Bandra, Mumbai")).toEqual([
      "beachside restaurant",
      "Bandra",
      "Mumbai",
    ]);
  });

  it("drops empty segments and de-duplicates case-insensitively", () => {
    expect(placeTokens("Bandra, , bandra,  Mumbai ")).toEqual(["Bandra", "Mumbai"]);
  });

  it("returns a single token when there are no commas", () => {
    expect(placeTokens("Reykjavík")).toEqual(["Reykjavík"]);
  });

  it("is empty for blank or comma-only input", () => {
    expect(placeTokens("")).toEqual([]);
    expect(placeTokens("  , ,")).toEqual([]);
  });
});

describe("pickBestPlace", () => {
  const bandras: OpenMeteoPlace[] = [
    // Deliberately ordered so a blind results[0] would pick the wrong one.
    place({ name: "Bandra", admin1: "Rajasthan", country: "India", population: 3000 }),
    place({
      name: "Bandra",
      admin1: "Maharashtra",
      admin2: "Mumbai Suburban",
      country: "India",
      population: 700000,
      latitude: 19.05,
      longitude: 72.84,
    }),
  ];

  it("prefers the highest-population match, not results[0]", () => {
    const best = pickBestPlace(bandras);
    expect(best?.admin1).toBe("Maharashtra");
    expect(best?.latitude).toBe(19.05);
  });

  it("lets a region hint override population", () => {
    // Even though the Rajasthan row is far less populous, a "Rajasthan" hint
    // must win it — proving disambiguation is by region, not a fixed index.
    const best = pickBestPlace(bandras, ["Rajasthan"]);
    expect(best?.admin1).toBe("Rajasthan");
  });

  it("matches a hint against admin2 / city, accent- and case-insensitively", () => {
    const best = pickBestPlace(bandras, ["mumbai"]);
    expect(best?.admin1).toBe("Maharashtra");
  });

  it("returns null when results are absent or empty (the omitted-key case)", () => {
    expect(pickBestPlace(undefined)).toBeNull();
    expect(pickBestPlace(null)).toBeNull();
    expect(pickBestPlace([])).toBeNull();
  });

  it("still returns a candidate when no hint matches and populations are unknown", () => {
    const only = [place({ name: "Nowhere", country: "Testland" })];
    expect(pickBestPlace(only, ["Elsewhere"])?.name).toBe("Nowhere");
  });
});
