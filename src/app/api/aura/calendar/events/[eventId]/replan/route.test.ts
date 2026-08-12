import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { DROPPED_ITEM_GAP_SLOT } from "@/lib/aura-outfit-planner";

/**
 * Route-level tests for inline Regenerate / Swap (#178). They pin the rules the
 * spec (§4) makes load-bearing:
 *
 *   1. **Soft, prompt-level exclusion.** Regenerate feeds the whole current pick
 *      as "don't reuse these"; Swap excludes one piece and keeps the rest. The
 *      exclusion lives in the prompt (guaranteeing a different result), and is
 *      soft — a best pick that reuses an excluded piece still persists, without a
 *      fabricated gap.
 *   2. **Human-edit bookkeeping.** Any edit flips provenance to `user_edited` and
 *      clears the cached `previewImageUrl` (an item-set change).
 *   3. **The same guardrails as the initial plan.** Consent boundary, the privacy
 *      invariant (title never egresses), and id reconciliation all still hold —
 *      the loop is shared with the plan route.
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
type OutfitStore = {
  id: string;
  provenance: string;
  rationale: string | null;
  gaps: unknown;
  previewImageUrl: string | null;
  items: OutfitItem[];
};

const SECRET_TITLE = "Oncology follow-up — CONFIDENTIAL";

let userId: string | null = "clerk_user_1";
let live = true;
let eventRow: EventRow;
let wardrobe: WardrobeRow[] = [];
let consent: ConsentRecord = null;
let stylePreference: { text: string } | null = null;
let outfitStore: OutfitStore | null = null;

// AI stub state.
let aiReplies: string[] = [];
let aiPrompts: string[] = [];
let aiError: Error | null = null;

class FakeAiProviderConfigError extends Error {}

let fetchedUrls: string[] = [];
const realFetch = globalThis.fetch;

// These tests use unplaced events (no geocoding/weather egress), so any outbound
// fetch is a bug — fail loudly. Cast via `unknown` because the throw-only shape
// doesn't structurally overlap the full `fetch` type.
const stubbedFetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input.toString();
  fetchedUrls.push(url);
  throw new Error(`Unexpected fetch to ${url}`);
}) as unknown as typeof globalThis.fetch;

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

function selectedOutfit(store: OutfitStore) {
  return {
    id: store.id,
    provenance: store.provenance,
    rationale: store.rationale,
    gaps: store.gaps,
    updatedAt: new Date("2026-08-11T00:00:00.000Z"),
    items: store.items.map((item) => {
      const w = wardrobe.find((candidate) => candidate.id === item.wardrobeItemId)!;
      return {
        position: item.position,
        wardrobeItem: { id: w.id, category: w.category, name: w.name, color: w.color },
      };
    }),
  };
}

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
          outfit: outfitStore
            ? {
                id: outfitStore.id,
                items: outfitStore.items.map((item) => ({ wardrobeItemId: item.wardrobeItemId })),
              }
            : null,
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
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          provenance: string;
          rationale: string | null;
          gaps: unknown;
          previewImageUrl?: string | null;
          items: { deleteMany: unknown; create: OutfitItem[] };
        };
      }) => {
        if (!outfitStore || outfitStore.id !== where.id) throw new Error("outfit not found");
        outfitStore.provenance = data.provenance;
        outfitStore.rationale = data.rationale;
        outfitStore.gaps = data.gaps;
        // Prisma leaves an omitted column untouched — only clear when the route
        // actually sends `previewImageUrl` (an item-set change).
        if ("previewImageUrl" in data) outfitStore.previewImageUrl = data.previewImageUrl ?? null;
        // deleteMany {} clears the join rows, then create re-adds the new set.
        outfitStore.items = data.items.create;
        return selectedOutfit(outfitStore);
      },
    },
  }),
}));

const { POST } = await import("./route");

const post = (eventId: string, body: unknown) =>
  POST(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}/replan`, {
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

function plannedOutfit(itemIds: string[], over: Partial<OutfitStore> = {}): OutfitStore {
  return {
    id: "outfit_1",
    provenance: "ai_planned",
    rationale: "The original pick.",
    gaps: [],
    previewImageUrl: "https://cdn.example/preview.jpg",
    items: itemIds.map((wardrobeItemId, index) => ({ wardrobeItemId, position: index })),
    ...over,
  };
}

const planReply = (itemIds: string[], gaps: { slot: string; note: string }[] = []) =>
  JSON.stringify({
    itemIds,
    occasion: "dinner date",
    rationale: "A fresh, weather-appropriate pick in a coherent palette.",
    gaps,
  });

beforeEach(() => {
  globalThis.fetch = stubbedFetch;
  userId = "clerk_user_1";
  live = true;
  eventRow = baseEvent();
  wardrobe = [
    wardrobeItem("a"),
    wardrobeItem("b", { category: "bottom" }),
    wardrobeItem("c", { category: "shoes" }),
    wardrobeItem("d", { category: "top" }),
  ];
  consent = activeConsent;
  stylePreference = null;
  outfitStore = plannedOutfit(["a", "b"]);
  aiReplies = [];
  aiPrompts = [];
  aiError = null;
  fetchedUrls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/aura/calendar/events/[eventId]/replan", () => {
  it("rejects an unauthenticated request without any AI call", async () => {
    userId = null;
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(401);
    expect(aiPrompts).toHaveLength(0);
  });

  it("400s a body with no mode", async () => {
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION });
    expect(response.status).toBe(400);
    expect(aiPrompts).toHaveLength(0);
  });

  it("400s a swap with no itemId", async () => {
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "swap" });
    expect(response.status).toBe(400);
    expect(aiPrompts).toHaveLength(0);
  });

  it("404s a foreign or unknown event without any AI call", async () => {
    userId = "clerk_user_2";
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(404);
    expect(aiPrompts).toHaveLength(0);
  });

  it("409s when the event has no outfit to edit yet", async () => {
    outfitStore = null;
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "not-planned" });
    expect(aiPrompts).toHaveLength(0);
  });

  it("404s a swap for a piece that isn't in the outfit", async () => {
    const response = await post("evt_1", {
      policyVersion: PLANNING_POLICY_VERSION,
      mode: "swap",
      itemId: "c",
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "item-not-in-outfit" });
    expect(aiPrompts).toHaveLength(0);
  });

  describe("consent boundary — no AI call unless active+current", () => {
    it("refuses when consent is absent", async () => {
      consent = null;
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "consent-required" });
      expect(aiPrompts).toHaveLength(0);
    });

    it("refuses when the client echoes a stale policy version", async () => {
      const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION - 1, mode: "regenerate" });
      expect(response.status).toBe(403);
      expect(aiPrompts).toHaveLength(0);
    });
  });

  it("Regenerate excludes the whole current pick and flips provenance + clears the preview", async () => {
    aiReplies = [planReply(["c", "d"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(200);
    const body = await response.json();

    // A demonstrably different pick.
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["c", "d"]);
    // The prompt told the model not to reuse the current pick (soft, prompt-level).
    expect(aiPrompts[0]).toContain("Do NOT reuse");
    expect(aiPrompts[0]).toContain("a (Item a)");
    expect(aiPrompts[0]).toContain("b (Item b)");
    expect(aiPrompts[0]).not.toContain("Keep these");

    // Human edit: provenance flips and the cached preview clears.
    expect(body.outfit.provenance).toBe("user_edited");
    expect(outfitStore?.provenance).toBe("user_edited");
    expect(outfitStore?.previewImageUrl).toBeNull();
    expect(outfitStore?.items.map((item) => item.wardrobeItemId)).toEqual(["c", "d"]);
  });

  it("Swap keeps the untouched pieces and replaces only the targeted one", async () => {
    // Swap out "a"; the model keeps "b" and picks "d".
    aiReplies = [planReply(["b", "d"])];
    const response = await post("evt_1", {
      policyVersion: PLANNING_POLICY_VERSION,
      mode: "swap",
      itemId: "a",
    });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(aiPrompts[0]).toContain("Keep these already-chosen pieces");
    expect(aiPrompts[0]).toContain("b (Item b)");
    expect(aiPrompts[0]).toContain("Do NOT reuse this piece: a (Item a)");

    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["b", "d"]);
    expect(body.outfit.provenance).toBe("user_edited");
    expect(outfitStore?.previewImageUrl).toBeNull();
  });

  it("is soft — a best pick that reuses an excluded piece persists without a fabricated gap", async () => {
    // Sparse wardrobe: only the current two exist, so the model can't avoid them.
    wardrobe = [wardrobeItem("a"), wardrobeItem("b", { category: "bottom" })];
    aiReplies = [planReply(["a", "b"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
    // No fabricated gap — softness, not a phantom hole.
    expect(body.outfit.gaps).toEqual([]);
    // Still a human edit.
    expect(body.outfit.provenance).toBe("user_edited");
    // The item set didn't change, so the cached preview stays valid (cleared only
    // on an actual item-set change).
    expect(outfitStore?.previewImageUrl).toBe("https://cdn.example/preview.jpg");
  });

  it("never sends the event title to the AI prompt", async () => {
    aiReplies = [planReply(["c"])];
    await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(aiPrompts.length).toBeGreaterThan(0);
    for (const prompt of aiPrompts) {
      expect(prompt.toLowerCase()).not.toContain("oncology");
      expect(prompt.toLowerCase()).not.toContain("confidential");
    }
  });

  it("recovers an invented id with a one-shot retry (shared id discipline)", async () => {
    aiReplies = [planReply(["c", "z"]), planReply(["c", "d"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["c", "d"]);
    expect(body.outfit.gaps).toEqual([]);
    expect(aiPrompts).toHaveLength(2);
    expect(aiPrompts[1]).toContain("Choose ONLY from these exact ids");
  });

  it("drops a persistently invalid id and gap-flags it — never a phantom", async () => {
    aiReplies = [planReply(["z"]), planReply(["c", "y"])];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["c"]);
    expect(
      body.outfit.gaps.some((gap: { slot: string }) => gap.slot === DROPPED_ITEM_GAP_SLOT),
    ).toBe(true);
  });

  it("502s when the reply can't be formatted even after a retry", async () => {
    aiReplies = ["not json", "still not json"];
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-plan-response" });
    expect(aiPrompts).toHaveLength(2);
  });

  it("503s when the AI provider is unconfigured", async () => {
    aiError = new FakeAiProviderConfigError("no key");
    const response = await post("evt_1", { policyVersion: PLANNING_POLICY_VERSION, mode: "regenerate" });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "ai-unavailable" });
  });
});
