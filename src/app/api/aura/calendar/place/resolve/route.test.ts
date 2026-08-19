import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";

/**
 * Route-level tests for the place-resolution probe the Add/Edit event form fires
 * on blur. It previews the planner's geocoding, so it exercises the REAL
 * geocoding library with a stubbed global `fetch`. Two properties are pinned:
 *
 *   1. **The consent boundary.** With Smart Planning consent absent, withdrawn,
 *      or at a stale policy version, the probe returns `consent_required` and
 *      `fetch` is NEVER called — the nudge is served without any egress.
 *   2. **The outcome mapping.** With active consent, a resolvable place returns
 *      `resolved` (with `approximate` set when the geocoder had to coarsen), and
 *      an unresolvable one returns `unresolved` — never a guess.
 */

type ConsentRecord = {
  policyVersion: number;
  consentedAt: Date;
  withdrawnAt: Date | null;
} | null;

let userId: string | null = "clerk_user_1";
let live = true;
let consent: ConsentRecord = null;
let userExists = true;

let fetchedUrls: string[] = [];

const BANDRA = {
  name: "Bandra",
  latitude: 19.05,
  longitude: 72.84,
  timezone: "Asia/Kolkata",
  admin1: "Maharashtra",
  admin2: "Mumbai Suburban",
  country: "India",
  population: 700000,
};

// Only real place names resolve; "beachside restaurant" misses so the loop
// coarsens to the "Bandra" hint — the approximate path.
function defaultGeocode(name: string): unknown {
  return /bandra|mumbai/i.test(name) ? { results: [BANDRA] } : {};
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
    user: {
      findUnique: async () => (userExists ? { id: "user_1" } : null),
    },
    planningConsent: {
      findUnique: async () => consent,
    },
  }),
}));

const { POST } = await import("./route");

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/aura/calendar/place/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

const activeConsent: ConsentRecord = {
  policyVersion: PLANNING_POLICY_VERSION,
  consentedAt: new Date("2026-01-01T00:00:00Z"),
  withdrawnAt: null,
};

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  userExists = true;
  consent = null;
  resolveGeocode = defaultGeocode;
  fetchedUrls = [];
  globalThis.fetch = stubbedFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/aura/calendar/place/resolve", () => {
  it("rejects an unauthenticated request without any egress", async () => {
    userId = null;
    const response = await post({ placeText: "Bandra" });
    expect(response.status).toBe(401);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("400s an empty place", async () => {
    consent = activeConsent;
    const response = await post({ placeText: "   " });
    expect(response.status).toBe(400);
    expect(fetchedUrls).toHaveLength(0);
  });

  describe("consent boundary — no egress unless active+current", () => {
    it("nudges (consent_required) with no consent, and never geocodes", async () => {
      consent = null;
      const response = await post({ placeText: "Bandra" });
      expect(await response.json()).toEqual({ status: "consent_required" });
      expect(fetchedUrls).toHaveLength(0);
    });

    it("nudges when consent was withdrawn", async () => {
      consent = { ...activeConsent, withdrawnAt: new Date("2026-02-01Z") };
      const response = await post({ placeText: "Bandra" });
      expect(await response.json()).toEqual({ status: "consent_required" });
      expect(fetchedUrls).toHaveLength(0);
    });

    it("nudges when the stored consent is at a superseded policy version", async () => {
      consent = { ...activeConsent, policyVersion: PLANNING_POLICY_VERSION - 1 };
      const response = await post({ placeText: "Bandra" });
      expect(await response.json()).toEqual({ status: "consent_required" });
      expect(fetchedUrls).toHaveLength(0);
    });

    it("nudges a caller with no user row yet, without geocoding", async () => {
      userExists = false;
      const response = await post({ placeText: "Bandra" });
      expect(await response.json()).toEqual({ status: "consent_required" });
      expect(fetchedUrls).toHaveLength(0);
    });
  });

  describe("with active consent", () => {
    it("resolves a place name exactly", async () => {
      consent = activeConsent;
      const response = await post({ placeText: "Bandra" });
      expect(await response.json()).toEqual({
        status: "resolved",
        placeLabel: expect.stringContaining("Bandra"),
        approximate: false,
      });
      expect(fetchedUrls.length).toBeGreaterThan(0);
    });

    it("flags an approximate match when it coarsens a venue to the city", async () => {
      consent = activeConsent;
      const response = await post({
        placeText: "beachside restaurant, Bandra",
      });
      const body = await response.json();
      expect(body.status).toBe("resolved");
      expect(body.approximate).toBe(true);
    });

    it("reports an honest miss when nothing resolves", async () => {
      consent = activeConsent;
      resolveGeocode = () => ({});
      const response = await post({ placeText: "Nowheresville" });
      expect(await response.json()).toEqual({ status: "unresolved" });
    });
  });
});
