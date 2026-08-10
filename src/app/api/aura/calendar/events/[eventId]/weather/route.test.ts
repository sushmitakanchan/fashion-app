import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";

/**
 * Route-level tests for live weather on a placed event — the calendar's first
 * outside contact. They exercise the REAL geocoding and weather libraries with a
 * stubbed global `fetch`, so two properties are observed end to end:
 *
 *   1. **The consent boundary.** With consent absent, withdrawn, or at a stale
 *      version — or the client echoing a stale version — egress is refused with a
 *      403 and `fetch` is never called. Only active-and-current consent lets any
 *      request leave.
 *   2. **The privacy invariant.** The event title never appears in any outbound
 *      URL — not to geocoding, not to weather. The row's `title` isn't even
 *      selected by the handler; this pins that it can't leak.
 *
 * Prisma is a store-backed stub so caching the geocoded coordinates on the event
 * (weather itself is never persisted) is observable as real state.
 */

type ConsentRecord = { policyVersion: number; withdrawnAt: Date | null } | null;

type EventRow = {
  id: string;
  clerkId: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  placeText: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

const SECRET_TITLE = "Oncology follow-up — CONFIDENTIAL";

let userId: string | null = "clerk_user_1";
let live = true;
let rows: EventRow[] = [];
let consentByClerk: Record<string, ConsentRecord> = {};

// Every outbound request the handler makes, in order — the assertion surface for
// "egress happened / didn't" and "the title never left".
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

// Canned geocoding, keyed by the `name` token. The default index only knows real
// place names, so "beachside restaurant" misses and the loop coarsens to
// "Bandra" — the approximate path. Tests override this to force other outcomes.
function defaultGeocode(name: string): unknown {
  return /bandra|mumbai/i.test(name) ? { results: [BANDRA] } : {};
}
let resolveGeocode: (name: string) => unknown = defaultGeocode;

let forecastPayload: unknown = {
  daily: {
    time: ["2026-08-12"],
    weather_code: [61],
    temperature_2m_max: [31],
    temperature_2m_min: [26],
    precipitation_probability_max: [80],
  },
};

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Route the two Open-Meteo hosts to their canned payloads and record every URL.
// Installed per-test (see beforeEach/afterEach) so the stub never leaks into
// other files sharing this test process.
const stubbedFetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchedUrls.push(url);
  if (url.includes("geocoding-api.open-meteo.com")) {
    const name = new URL(url).searchParams.get("name") ?? "";
    return jsonResponse(resolveGeocode(name));
  }
  if (url.includes("api.open-meteo.com")) {
    return jsonResponse(forecastPayload);
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
  isCloudinaryConfigured: () => live,
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    plannedEvent: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; user: { clerkId: string } };
      }) => {
        const row = rows.find(
          (candidate) =>
            candidate.id === where.id && candidate.clerkId === where.user.clerkId,
        );
        if (!row) return null;
        return {
          id: row.id,
          startsAt: row.startsAt,
          allDay: row.allDay,
          placeText: row.placeText,
          placeLabel: row.placeLabel,
          latitude: row.latitude,
          longitude: row.longitude,
          timezone: row.timezone,
          user: { planningConsent: consentByClerk[row.clerkId] ?? null },
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<EventRow>;
      }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      },
    },
  }),
}));

const { POST } = await import("./route");

const post = (eventId: string, body: unknown) =>
  POST(
    new Request(
      `http://localhost/api/aura/calendar/events/${eventId}/weather`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ eventId }) },
  );

const activeConsent: ConsentRecord = {
  policyVersion: PLANNING_POLICY_VERSION,
  withdrawnAt: null,
};

function placedEvent(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt_1",
    clerkId: "clerk_user_1",
    title: SECRET_TITLE,
    // Near-future so the day is inside the forecast horizon.
    startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    allDay: false,
    placeText: "beachside restaurant, Bandra, Mumbai",
    placeLabel: null,
    latitude: null,
    longitude: null,
    timezone: null,
    ...over,
  };
}

beforeEach(() => {
  globalThis.fetch = stubbedFetch;
  userId = "clerk_user_1";
  live = true;
  fetchedUrls = [];
  rows = [placedEvent()];
  consentByClerk = { clerk_user_1: activeConsent };
  resolveGeocode = defaultGeocode;
  forecastPayload = {
    daily: {
      time: ["2026-08-12"],
      weather_code: [61],
      temperature_2m_max: [31],
      temperature_2m_min: [26],
      precipitation_probability_max: [80],
    },
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/aura/calendar/events/[eventId]/weather", () => {
  it("rejects an unauthenticated request without any egress", async () => {
    userId = null;
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(401);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("400s a body missing the echoed policy version", async () => {
    const response = await post("evt_1", {});
    expect(response.status).toBe(400);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("404s a foreign or unknown event without any egress", async () => {
    userId = "clerk_user_2"; // not the owner
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(404);
    expect(fetchedUrls).toHaveLength(0);
  });

  it("returns placed:false for an event with no place, without egress", async () => {
    rows = [placedEvent({ placeText: null })];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ placed: false });
    expect(fetchedUrls).toHaveLength(0);
  });

  describe("consent boundary — egress is refused (no fetch) unless active+current", () => {
    it("refuses when consent is absent", async () => {
      consentByClerk = { clerk_user_1: null };
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "consent-required" });
      expect(fetchedUrls).toHaveLength(0);
    });

    it("refuses when consent is withdrawn", async () => {
      consentByClerk = {
        clerk_user_1: { policyVersion: PLANNING_POLICY_VERSION, withdrawnAt: new Date() },
      };
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
      expect(response.status).toBe(403);
      expect(fetchedUrls).toHaveLength(0);
    });

    it("refuses when the stored consent is at a superseded policy version", async () => {
      consentByClerk = {
        clerk_user_1: { policyVersion: PLANNING_POLICY_VERSION - 1, withdrawnAt: null },
      };
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
      expect(response.status).toBe(403);
      expect(fetchedUrls).toHaveLength(0);
    });

    it("refuses when the client echoes a stale policy version", async () => {
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION - 1 });
      expect(response.status).toBe(403);
      expect(fetchedUrls).toHaveLength(0);
    });
  });

  it("geocodes then fetches weather with active consent, caching the coordinates", async () => {
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      placed: true,
      unresolved: false,
      approximate: true, // "beachside restaurant" was dropped for "Bandra"
      place: { latitude: 19.05, longitude: 72.84, timezone: "Asia/Kolkata" },
      weatherStatus: "ok",
    });
    expect(body.weather).toMatchObject({
      weatherCode: 61,
      temperatureMax: 31,
      temperatureMin: 26,
      description: { label: "Light rain", group: "rain" },
    });

    // Both providers were contacted, geocoding before weather.
    expect(fetchedUrls.some((u) => u.includes("geocoding-api.open-meteo.com"))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes("api.open-meteo.com/v1/forecast"))).toBe(true);

    // The coordinates are cached on the event; weather is not persisted.
    const cached = rows.find((r) => r.id === "evt_1")!;
    expect(cached.latitude).toBe(19.05);
    expect(cached.longitude).toBe(72.84);
    expect(cached.timezone).toBe("Asia/Kolkata");
    expect(cached.placeLabel).toBe("Bandra, Maharashtra");
  });

  it("never sends the event title to any outside service", async () => {
    await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(fetchedUrls.length).toBeGreaterThan(0);
    for (const url of fetchedUrls) {
      const decoded = decodeURIComponent(url).toLowerCase();
      expect(decoded).not.toContain("oncology");
      expect(decoded).not.toContain("confidential");
    }
  });

  it("reuses cached coordinates and skips geocoding on a later view", async () => {
    rows = [
      placedEvent({
        latitude: 19.05,
        longitude: 72.84,
        timezone: "Asia/Kolkata",
        placeLabel: "Bandra, Maharashtra",
      }),
    ];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(200);
    // No geocoding call — only the weather fetch.
    expect(fetchedUrls.some((u) => u.includes("geocoding-api"))).toBe(false);
    expect(fetchedUrls.some((u) => u.includes("/v1/forecast"))).toBe(true);
  });

  it("reports an honest miss (no coordinates, no weather) when nothing resolves", async () => {
    resolveGeocode = () => ({}); // the `results` key is omitted on no match
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      placed: true,
      unresolved: true,
      place: null,
      weather: null,
    });
    // Geocoding was attempted for each token, but no weather fetch and no cache.
    expect(fetchedUrls.some((u) => u.includes("/v1/forecast"))).toBe(false);
    const row = rows.find((r) => r.id === "evt_1")!;
    expect(row.latitude).toBeNull();
  });
});
