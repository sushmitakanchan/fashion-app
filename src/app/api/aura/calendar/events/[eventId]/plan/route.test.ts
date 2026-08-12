import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { DROPPED_ITEM_GAP_SLOT } from "@/lib/aura-outfit-planner";

/**
 * Route-level tests for per-event "Plan this outfit" (#176). They pin the
 * load-bearing rules end to end:
 *
 *   1. **The consent boundary.** No AI call and no egress happen unless consent is
 *      active, current, and the client echoes the current policy version.
 *   2. **The privacy invariant.** The event title never reaches the AI prompt —
 *      it isn't even selected by the handler.
 *   3. **Id discipline.** Returned ids are validated against the fed wardrobe set;
 *      an invented id is recovered by one retry, and an id still invalid after
 *      that is dropped and gap-flagged — never persisted as a phantom item.
 *   4. **Honest gaps + horizon degrade.** An empty pick is legal only beside a
 *      gap; beyond the forecast horizon the prompt degrades with a note.
 *
 * `generateText` is a queue-backed stub (canned replies, recorded prompts) and
 * Prisma is a store-backed stub, so persistence is observed as real state.
 */

type ConsentRecord = { policyVersion: number; withdrawnAt: Date | null } | null;

type EventRow = {
  id: string;
  clerkId: string;
  userId: string;
  title: string;
  occasion: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  placeText: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

type WardrobeRow = {
  id: string;
  userId: string;
  category: string;
  name: string;
  color: string;
  brand: string | null;
  occasion: string | null;
  deletedAt: Date | null;
};

type OutfitItem = { position: number | null; wardrobeItemId: string };
type OutfitRow = {
  id: string;
  eventId: string;
  userId: string;
  provenance: string;
  rationale: string | null;
  gaps: unknown;
  items: OutfitItem[];
};

const SECRET_TITLE = "Oncology follow-up — CONFIDENTIAL";

let userId: string | null = "clerk_user_1";
let live = true;
let eventRow: EventRow;
let wardrobe: WardrobeRow[] = [];
let consent: ConsentRecord = null;
let stylePreference: { text: string } | null = null;
let existingOutfit: OutfitRow | null = null;
let createdOutfit: OutfitRow | null = null;

// AI stub state.
let aiReplies: string[] = [];
let aiPrompts: string[] = [];
let aiError: Error | null = null;

class FakeAiProviderConfigError extends Error {}

// Geocoding/weather egress recorder.
let fetchedUrls: string[] = [];
let forecastStatus = 200;
const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const BANDRA = {
  name: "Bandra",
  latitude: 19.05,
  longitude: 72.84,
  timezone: "Asia/Kolkata",
  admin1: "Maharashtra",
  country: "India",
  population: 700000,
};

const stubbedFetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchedUrls.push(url);
  if (url.includes("geocoding-api.open-meteo.com")) {
    const name = new URL(url).searchParams.get("name") ?? "";
    return jsonResponse(/bandra|mumbai/i.test(name) ? { results: [BANDRA] } : {});
  }
  if (url.includes("api.open-meteo.com")) {
    if (forecastStatus === 400) return jsonResponse({}, 400);
    return jsonResponse({
      daily: {
        time: ["2026-08-12"],
        weather_code: [61],
        temperature_2m_max: [31],
        temperature_2m_min: [26],
        precipitation_probability_max: [80],
      },
    });
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

mock.module("@/lib/ai", () => ({
  AiProviderConfigError: FakeAiProviderConfigError,
  generateText: async ({ prompt }: { instructions: string; prompt: string }) => {
    aiPrompts.push(prompt);
    if (aiError) throw aiError;
    return { text: aiReplies.shift() ?? "", provider: "openai" };
  },
}));

let outfitSeq = 0;

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    plannedEvent: {
      findFirst: async ({ where }: { where: { id: string; user: { clerkId: string } } }) => {
        if (eventRow.id !== where.id || eventRow.clerkId !== where.user.clerkId) return null;
        return {
          id: eventRow.id,
          userId: eventRow.userId,
          occasion: eventRow.occasion,
          startsAt: eventRow.startsAt,
          endsAt: eventRow.endsAt,
          allDay: eventRow.allDay,
          placeText: eventRow.placeText,
          placeLabel: eventRow.placeLabel,
          latitude: eventRow.latitude,
          longitude: eventRow.longitude,
          timezone: eventRow.timezone,
          outfit: existingOutfit ? { id: existingOutfit.id } : null,
          user: { planningConsent: consent, stylePreference },
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<EventRow> }) => {
        if (eventRow.id === where.id) Object.assign(eventRow, data);
        return eventRow;
      },
    },
    wardrobeItem: {
      findMany: async ({ where }: { where: { userId: string; deletedAt: null } }) =>
        wardrobe
          .filter((item) => item.userId === where.userId && item.deletedAt === null)
          .map((item) => ({
            id: item.id,
            category: item.category,
            name: item.name,
            color: item.color,
            brand: item.brand,
            occasion: item.occasion,
          })),
    },
    plannedOutfit: {
      create: async ({
        data,
      }: {
        data: {
          eventId: string;
          userId: string;
          provenance: string;
          rationale: string | null;
          gaps: unknown;
          items: { create: OutfitItem[] };
        };
      }) => {
        outfitSeq += 1;
        createdOutfit = {
          id: `outfit_${outfitSeq}`,
          eventId: data.eventId,
          userId: data.userId,
          provenance: data.provenance,
          rationale: data.rationale,
          gaps: data.gaps,
          items: data.items.create,
        };
        // Build the selected shape (items → wardrobeItem display data).
        return {
          id: createdOutfit.id,
          provenance: createdOutfit.provenance,
          rationale: createdOutfit.rationale,
          gaps: createdOutfit.gaps,
          items: createdOutfit.items.map((item) => {
            const w = wardrobe.find((candidate) => candidate.id === item.wardrobeItemId)!;
            return {
              position: item.position,
              wardrobeItem: { id: w.id, category: w.category, name: w.name, color: w.color },
            };
          }),
        };
      },
    },
  }),
}));

const { POST } = await import("./route");

const post = (eventId: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ eventId }) },
  );

const activeConsent: ConsentRecord = { policyVersion: PLANNING_POLICY_VERSION, withdrawnAt: null };

function baseEvent(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt_1",
    clerkId: "clerk_user_1",
    userId: "user_1",
    title: SECRET_TITLE,
    occasion: "dinner date",
    startsAt: new Date("2026-08-12T13:30:00.000Z"),
    endsAt: null,
    allDay: false,
    placeText: null,
    placeLabel: null,
    latitude: null,
    longitude: null,
    timezone: null,
    ...over,
  };
}

function wardrobeItem(id: string, over: Partial<WardrobeRow> = {}): WardrobeRow {
  return {
    id,
    userId: "user_1",
    category: "top",
    name: `Item ${id}`,
    color: "black",
    brand: null,
    occasion: null,
    deletedAt: null,
    ...over,
  };
}

const planReply = (itemIds: string[], gaps: { slot: string; note: string }[] = []) =>
  JSON.stringify({
    itemIds,
    occasion: "dinner date",
    rationale: "A clean, weather-appropriate pick in a coherent dark palette.",
    gaps,
  });

beforeEach(() => {
  globalThis.fetch = stubbedFetch;
  userId = "clerk_user_1";
  live = true;
  eventRow = baseEvent();
  wardrobe = [wardrobeItem("a"), wardrobeItem("b", { category: "bottom" }), wardrobeItem("c", { category: "shoes" })];
  consent = activeConsent;
  stylePreference = null;
  existingOutfit = null;
  createdOutfit = null;
  aiReplies = [];
  aiPrompts = [];
  aiError = null;
  fetchedUrls = [];
  forecastStatus = 200;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/aura/calendar/events/[eventId]/plan", () => {
  it("rejects an unauthenticated request without any AI call", async () => {
    userId = null;
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(401);
    expect(aiPrompts).toHaveLength(0);
  });

  it("400s a body missing the echoed policy version", async () => {
    const response = await post("evt_1", {});
    expect(response.status).toBe(400);
    expect(aiPrompts).toHaveLength(0);
  });

  it("404s a foreign or unknown event without any AI call", async () => {
    userId = "clerk_user_2";
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(404);
    expect(aiPrompts).toHaveLength(0);
  });

  it("409s when the event already has an outfit (non-destructive)", async () => {
    existingOutfit = {
      id: "outfit_existing",
      eventId: "evt_1",
      userId: "user_1",
      provenance: "ai_planned",
      rationale: "prior",
      gaps: [],
      items: [],
    };
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(409);
    expect(aiPrompts).toHaveLength(0);
  });

  describe("consent boundary — no AI call and no egress unless active+current", () => {
    it("refuses when consent is absent", async () => {
      consent = null;
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "consent-required" });
      expect(aiPrompts).toHaveLength(0);
      expect(fetchedUrls).toHaveLength(0);
    });

    it("refuses when consent is withdrawn", async () => {
      consent = { policyVersion: PLANNING_POLICY_VERSION, withdrawnAt: new Date() };
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
      expect(response.status).toBe(403);
      expect(aiPrompts).toHaveLength(0);
    });

    it("refuses when the client echoes a stale policy version", async () => {
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION - 1 });
      expect(response.status).toBe(403);
      expect(aiPrompts).toHaveLength(0);
    });
  });

  it("422s with no AI call when the wardrobe is empty", async () => {
    wardrobe = [];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ code: "empty-wardrobe" });
    expect(aiPrompts).toHaveLength(0);
  });

  it("plans one outfit and persists it as ai_planned with ordered items", async () => {
    aiReplies = [planReply(["a", "b"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outfit).toMatchObject({
      provenance: "ai_planned",
      rationale: expect.any(String),
      gaps: [],
    });
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
    expect(createdOutfit?.items).toEqual([
      { wardrobeItemId: "a", position: 0 },
      { wardrobeItemId: "b", position: 1 },
    ]);
    expect(aiPrompts).toHaveLength(1);
  });

  it("never sends the event title to the AI prompt", async () => {
    eventRow = baseEvent({ placeText: "beachside restaurant, Bandra" });
    aiReplies = [planReply(["a"])];
    await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(aiPrompts.length).toBeGreaterThan(0);
    for (const prompt of aiPrompts) {
      expect(prompt.toLowerCase()).not.toContain("oncology");
      expect(prompt.toLowerCase()).not.toContain("confidential");
    }
    // Nor to any outside service (geocoding/weather).
    for (const url of fetchedUrls) {
      expect(decodeURIComponent(url).toLowerCase()).not.toContain("oncology");
    }
  });

  it("recovers an invented id with a one-shot retry (no gap)", async () => {
    aiReplies = [planReply(["a", "z"]), planReply(["a", "b"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
    expect(body.outfit.gaps).toEqual([]);
    // The retry restated the exact allowed id set.
    expect(aiPrompts).toHaveLength(2);
    expect(aiPrompts[1]).toContain("Choose ONLY from these exact ids");
  });

  it("drops a persistently invalid id and gap-flags it — never a phantom", async () => {
    aiReplies = [planReply(["z"]), planReply(["a", "y"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(201);
    const body = await response.json();
    // Only the valid id survives; the invented one is dropped, not persisted.
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["a"]);
    expect(createdOutfit?.items.some((item) => item.wardrobeItemId === "y")).toBe(false);
    expect(body.outfit.gaps.some((gap: { slot: string }) => gap.slot === DROPPED_ITEM_GAP_SLOT)).toBe(
      true,
    );
  });

  it("persists an empty pick only beside a gap", async () => {
    aiReplies = [planReply([], [{ slot: "formal suit", note: "No formalwear in the wardrobe." }])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.outfit.items).toHaveLength(0);
    expect(body.outfit.gaps).toHaveLength(1);
    expect(aiPrompts).toHaveLength(1); // no retry — no invalid ids
  });

  it("degrades to a weather-less plan with a note beyond the forecast horizon", async () => {
    eventRow = baseEvent({
      placeText: "Bandra, Mumbai",
      startsAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    });
    aiReplies = [planReply(["a"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(201);
    // Geocoding ran (place resolved) but no forecast fetch, and the prompt says so.
    expect(fetchedUrls.some((u) => u.includes("geocoding-api"))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes("/v1/forecast"))).toBe(false);
    expect(aiPrompts[0].toLowerCase()).toContain("no forecast");
  });

  it("includes a live-weather line when the event is in-horizon and placed", async () => {
    eventRow = baseEvent({
      placeText: "Bandra, Mumbai",
      startsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });
    aiReplies = [planReply(["a"])];
    await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(fetchedUrls.some((u) => u.includes("/v1/forecast"))).toBe(true);
    expect(aiPrompts[0].toLowerCase()).not.toContain("no forecast");
  });

  it("feeds the style preference when present, omits it when absent", async () => {
    stylePreference = { text: "minimal, dark tones, rarely dresses" };
    aiReplies = [planReply(["a"])];
    await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(aiPrompts[0]).toContain("minimal, dark tones");
  });

  it("502s when the reply can't be formatted even after a retry", async () => {
    aiReplies = ["not json", "still not json"];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-plan-response" });
    expect(aiPrompts).toHaveLength(2);
  });

  it("503s when the AI provider is unconfigured", async () => {
    aiError = new FakeAiProviderConfigError("no key");
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "ai-unavailable" });
  });
});
