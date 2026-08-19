import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";

/**
 * Route-level tests for the place autocomplete. It previews the planner's
 * geocoding index, so it exercises the REAL `searchPlaces` with a stubbed global
 * `fetch`. Two properties are pinned:
 *
 *   1. **The consent boundary.** Without active-and-current Smart Planning
 *      consent the route returns `consent_required` and `fetch` is never called.
 *   2. **Suggestions are resolvable and ranked.** With consent, matches come back
 *      best-first and de-duplicated — the options are exactly what the planner
 *      would later resolve.
 */

type ConsentRecord = {
  policyVersion: number;
  consentedAt: Date;
  withdrawnAt: Date | null;
} | null;

let userId: string | null = "clerk_user_1";
let live = true;
let consent: ConsentRecord = null;

let fetchedUrls: string[] = [];

const MUMBAI = {
  name: "Mumbai",
  latitude: 19.07,
  longitude: 72.87,
  timezone: "Asia/Kolkata",
  admin1: "Maharashtra",
  country: "India",
  population: 12_000_000,
};
const SMALL_BANDRA = {
  name: "Bandra",
  latitude: 25.5,
  longitude: 74.6,
  timezone: "Asia/Kolkata",
  admin1: "Rajasthan",
  country: "India",
  population: 3000,
};
const BIG_BANDRA = {
  name: "Bandra",
  latitude: 19.05,
  longitude: 72.84,
  timezone: "Asia/Kolkata",
  admin1: "Maharashtra",
  country: "India",
  population: 700_000,
};

// Keyed by the searched `name`. "band" → two same-named Bandras (rank by
// population); anything else → empty.
function defaultGeocode(name: string): unknown {
  if (/band/i.test(name)) {
    return { results: [SMALL_BANDRA, BIG_BANDRA] };
  }
  if (/mumbai/i.test(name)) return { results: [MUMBAI] };
  return {};
}
let resolveGeocode: (name: string) => unknown = defaultGeocode;

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const stubbedFetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchedUrls.push(url);
  if (url.includes("geocoding-api.open-meteo.com")) {
    const name = new URL(url).searchParams.get("name") ?? "";
    return jsonResponse(resolveGeocode(name));
  }
  throw new Error(`Unexpected fetch to ${url}`);
}) as typeof globalThis.fetch;

mock.module("server-only", () => ({}));

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isDatabaseConfigured: () => live,
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: async () => ({ id: "user_1" }) },
    planningConsent: { findUnique: async () => consent },
  }),
}));

const { GET } = await import("./route");

const search = (q: string | null) =>
  GET(
    new Request(
      `http://localhost/api/aura/calendar/place/search${
        q === null ? "" : `?q=${encodeURIComponent(q)}`
      }`,
    ),
  );

const activeConsent: ConsentRecord = {
  policyVersion: PLANNING_POLICY_VERSION,
  consentedAt: new Date("2026-01-01T00:00:00Z"),
  withdrawnAt: null,
};

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  consent = null;
  resolveGeocode = defaultGeocode;
  fetchedUrls = [];
  globalThis.fetch = stubbedFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET /api/aura/calendar/place/search", () => {
  it("rejects an unauthenticated request without egress", async () => {
    userId = null;
    const response = await search("Bandra");
    expect(response.status).toBe(401);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("400s a query below the 2-char floor, without egress", async () => {
    consent = activeConsent;
    const response = await search("b");
    expect(response.status).toBe(400);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("returns consent_required with no active consent, and never searches", async () => {
    consent = null;
    const response = await search("Bandra");
    expect(await response.json()).toEqual({ status: "consent_required" });
    expect(fetchedUrls).toHaveLength(0);
  });

  it("suggests resolvable places, most-populous first, with active consent", async () => {
    consent = activeConsent;
    const response = await search("Bandra");
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(fetchedUrls.length).toBeGreaterThan(0);
    // Both entries are "Bandra"; the label carries the region, and the populous
    // Maharashtra one ranks first.
    expect(body.places[0]).toMatchObject({
      label: "Bandra, Maharashtra",
      latitude: 19.05,
    });
  });

  it("returns an empty list (status ok) when nothing matches", async () => {
    consent = activeConsent;
    resolveGeocode = () => ({});
    const response = await search("Zzxqq");
    expect(await response.json()).toEqual({ status: "ok", places: [] });
  });
});
