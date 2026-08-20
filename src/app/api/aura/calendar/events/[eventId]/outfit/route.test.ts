import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for the manual-outfit endpoint (#207/#208). They pin the
 * contract the grilling made load-bearing:
 *
 *   1. **Full-set replace, create-or-replace.** The client sends the complete
 *      desired pick; the server sets the outfit to exactly that, creating one when
 *      the event was never planned and replacing one that exists.
 *   2. **Own live wardrobe only.** Every id must be the caller's own, non-deleted
 *      `WardrobeItem`; a foreign or soft-deleted id fails the whole save.
 *   3. **Human-edit bookkeeping.** A manual pick sets `provenance = user_edited`,
 *      carries no AI rationale/gaps, and clears the cached `previewImageUrl` only
 *      on an actual item-set change.
 *   4. **No egress.** No AI, geocoding, or weather — so any outbound fetch is a
 *      bug, and there is no consent gate.
 *
 * Prisma is a store-backed stub so persistence is observed as real state.
 */

type WardrobeRow = {
  id: string;
  userId: string;
  category: string;
  name: string;
  color: string;
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
let eventRow: { id: string; clerkId: string; userId: string; title: string };
let wardrobe: WardrobeRow[] = [];
let outfitStore: OutfitStore | null = null;
let nextOutfitId = 1;

let fetchedUrls: string[] = [];
const realFetch = globalThis.fetch;

// A manual pick makes no external call, so any outbound fetch is a bug — fail
// loudly. Cast via `unknown` because the throw-only shape doesn't structurally
// overlap the full `fetch` type.
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

function selectedOutfit(store: OutfitStore) {
  return {
    id: store.id,
    provenance: store.provenance,
    rationale: store.rationale,
    gaps: store.gaps,
    previewImageUrl: store.previewImageUrl,
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
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
          outfit: outfitStore
            ? {
                id: outfitStore.id,
                items: outfitStore.items.map((item) => ({ wardrobeItemId: item.wardrobeItemId })),
              }
            : null,
        };
      },
    },
    wardrobeItem: {
      findMany: async ({
        where,
      }: {
        where: { id: { in: string[] }; userId: string; deletedAt: null };
      }) =>
        wardrobe
          .filter(
            (item) =>
              where.id.in.includes(item.id) &&
              item.userId === where.userId &&
              item.deletedAt === null,
          )
          .map((item) => ({ id: item.id })),
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
        outfitStore = {
          id: `outfit_${nextOutfitId++}`,
          provenance: data.provenance,
          rationale: data.rationale,
          gaps: data.gaps,
          previewImageUrl: null,
          items: data.items.create,
        };
        return selectedOutfit(outfitStore);
      },
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
        // Prisma leaves an omitted column untouched — clear only when the route
        // actually sends `previewImageUrl` (an item-set change).
        if ("previewImageUrl" in data) outfitStore.previewImageUrl = data.previewImageUrl ?? null;
        // deleteMany {} clears the join rows, then create re-adds the new set.
        outfitStore.items = data.items.create;
        return selectedOutfit(outfitStore);
      },
    },
  }),
}));

const { PUT } = await import("./route");

const put = (eventId: string, body: unknown) =>
  PUT(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}/outfit`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ eventId }) },
  );

function wardrobeItem(id: string, over: Partial<WardrobeRow> = {}): WardrobeRow {
  return {
    id,
    userId: "user_1",
    category: "top",
    name: `Item ${id}`,
    color: "black",
    deletedAt: null,
    ...over,
  };
}

function plannedOutfit(itemIds: string[], over: Partial<OutfitStore> = {}): OutfitStore {
  return {
    id: "outfit_existing",
    provenance: "ai_planned",
    rationale: "The original AI pick.",
    gaps: [{ slot: "shoes", note: "no shoes yet" }],
    previewImageUrl: "https://cdn.example/preview.jpg",
    items: itemIds.map((wardrobeItemId, index) => ({ wardrobeItemId, position: index })),
    ...over,
  };
}

beforeEach(() => {
  globalThis.fetch = stubbedFetch;
  userId = "clerk_user_1";
  live = true;
  eventRow = { id: "evt_1", clerkId: "clerk_user_1", userId: "user_1", title: SECRET_TITLE };
  wardrobe = [
    wardrobeItem("a"),
    wardrobeItem("b", { category: "bottom" }),
    wardrobeItem("c", { category: "shoes" }),
    wardrobeItem("d", { category: "top" }),
  ];
  outfitStore = null;
  nextOutfitId = 1;
  fetchedUrls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("PUT /api/aura/calendar/events/[eventId]/outfit", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    const response = await put("evt_1", { itemIds: ["a"] });
    expect(response.status).toBe(401);
    expect(outfitStore).toBeNull();
  });

  it("503s when the database is not configured", async () => {
    live = false;
    const response = await put("evt_1", { itemIds: ["a"] });
    expect(response.status).toBe(503);
  });

  it("400s an empty pick (never a silent un-plan)", async () => {
    const response = await put("evt_1", { itemIds: [] });
    expect(response.status).toBe(400);
    expect(outfitStore).toBeNull();
  });

  it("400s more than the max pieces", async () => {
    const response = await put("evt_1", {
      itemIds: ["a", "b", "c", "d", "a2", "b2", "c2", "d2", "e2"],
    });
    expect(response.status).toBe(400);
  });

  it("400s a pick with a duplicate piece", async () => {
    const response = await put("evt_1", { itemIds: ["a", "a"] });
    expect(response.status).toBe(400);
    expect(outfitStore).toBeNull();
  });

  it("404s a foreign or unknown event", async () => {
    userId = "clerk_user_2";
    const response = await put("evt_1", { itemIds: ["a"] });
    expect(response.status).toBe(404);
    expect(outfitStore).toBeNull();
  });

  it("creates an outfit from nothing, as a user edit with no AI rationale/gaps", async () => {
    const response = await put("evt_1", { itemIds: ["a", "b"] });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["a", "b"]);
    expect(body.outfit.provenance).toBe("user_edited");
    expect(body.outfit.rationale).toBeNull();
    expect(body.outfit.gaps).toEqual([]);
    expect(body.outfit.previewImageUrl).toBeNull();
    // Persisted, not just echoed.
    expect(outfitStore?.provenance).toBe("user_edited");
    expect(outfitStore?.items.map((item) => item.wardrobeItemId)).toEqual(["a", "b"]);
  });

  it("replaces an existing outfit and clears its stale preview + AI notes on a change", async () => {
    outfitStore = plannedOutfit(["a", "b"]);
    const response = await put("evt_1", { itemIds: ["c", "d"] });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.outfit.items.map((item: { id: string }) => item.id)).toEqual(["c", "d"]);
    expect(body.outfit.provenance).toBe("user_edited");
    expect(body.outfit.rationale).toBeNull();
    expect(body.outfit.gaps).toEqual([]);
    // Item set changed → the cached preview is dropped.
    expect(outfitStore?.previewImageUrl).toBeNull();
    expect(outfitStore?.items.map((item) => item.wardrobeItemId)).toEqual(["c", "d"]);
  });

  it("keeps a valid preview when the same set is re-saved (no item-set change)", async () => {
    outfitStore = plannedOutfit(["a", "b"]);
    const response = await put("evt_1", { itemIds: ["a", "b"] });
    expect(response.status).toBe(200);
    // Same set → preview stays; still a human edit.
    expect(outfitStore?.previewImageUrl).toBe("https://cdn.example/preview.jpg");
    expect(outfitStore?.provenance).toBe("user_edited");
  });

  it("rejects a foreign wardrobe id (not the caller's own) — whole save fails", async () => {
    wardrobe.push(wardrobeItem("x", { userId: "user_2" }));
    const response = await put("evt_1", { itemIds: ["a", "x"] });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-items" });
    expect(outfitStore).toBeNull();
  });

  it("rejects a soft-deleted wardrobe id — only live pieces may be worn", async () => {
    wardrobe = [wardrobeItem("a"), wardrobeItem("gone", { deletedAt: new Date() })];
    const response = await put("evt_1", { itemIds: ["a", "gone"] });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "invalid-items" });
    expect(outfitStore).toBeNull();
  });

  it("makes no external call (no AI, geocoding, or weather; no consent gate)", async () => {
    const response = await put("evt_1", { itemIds: ["a", "b"] });
    expect(response.status).toBe(200);
    expect(fetchedUrls).toHaveLength(0);
  });
});
