import { beforeEach, describe, expect, it, mock } from "bun:test";

import { DEFAULT_PLANNED_OCCASION } from "@/lib/validations";

/**
 * Route-level tests for the manual Outfit Calendar events API: range listing
 * (`GET`) and manual add (`POST`). One store-backed Prisma stub backs both, so
 * the acceptance criterion that matters — an added event is immediately visible
 * in its week — is observable end to end (add, then list). Only Clerk, config,
 * and persistence are stubbed at the module boundary; the Zod contract is real.
 *
 * The privacy invariant of this ticket is also asserted here: adding an event is
 * a pure write with no geocoding. The place is stored raw and the geocoded
 * columns are never written.
 */

type OutfitFixture = {
  id: string;
  provenance: "ai_planned" | "user_edited";
  rationale: string | null;
  gaps: unknown;
  updatedAt: Date;
  items: {
    position: number | null;
    wardrobeItem: { id: string; category: string; name: string; color: string };
  }[];
};

type EventRow = {
  id: string;
  userId: string;
  title: string;
  occasion: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  placeText: string | null;
  source: "manual" | "google";
  outfit?: OutfitFixture | null;
};

let usersByClerk: Record<string, string> = {
  clerk_user_1: "u1",
  clerk_user_2: "u2",
};

let userId: string | null = "clerk_user_1";
let live = true;
let rows: EventRow[] = [];
let nextId = 1;
let nextUserId = 3;
let clerkEmail: string | null = "new@example.test";
// The exact `data` handed to `plannedEvent.create`, captured so the test can
// assert the geocoded columns are never written on a manual add.
let lastCreateData: Record<string, unknown> | null = null;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () =>
    clerkEmail
      ? {
          primaryEmailAddress: { emailAddress: clerkEmail },
          fullName: "New Participant",
          imageUrl: "https://img.example.test/new.png",
        }
      : { primaryEmailAddress: null, fullName: null, imageUrl: null },
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isCloudinaryConfigured: () => live,
  isDatabaseConfigured: () => live,
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
}));

const eventFields = (row: EventRow) => ({
  id: row.id,
  title: row.title,
  occasion: row.occasion,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  allDay: row.allDay,
  placeText: row.placeText,
  source: row.source,
  outfit: row.outfit ?? null,
});

const prismaStub = {
  user: {
    findUnique: async ({ where }: { where: { clerkId: string } }) => {
      const id = usersByClerk[where.clerkId];
      return id ? { id } : null;
    },
    create: async ({ data }: { data: { clerkId: string } }) => {
      const id = `u${nextUserId++}`;
      usersByClerk[data.clerkId] = id;
      return { id };
    },
  },
  plannedEvent: {
    findMany: async ({
      where,
    }: {
      where: {
        user: { clerkId: string };
        startsAt?: { gte?: Date; lt?: Date };
      };
    }) => {
      const owner = usersByClerk[where.user.clerkId];
      const gte = where.startsAt?.gte;
      const lt = where.startsAt?.lt;
      return rows
        .filter(
          (row) =>
            row.userId === owner &&
            (!gte || row.startsAt.getTime() >= gte.getTime()) &&
            (!lt || row.startsAt.getTime() < lt.getTime()),
        )
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .map(eventFields);
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      lastCreateData = data;
      const row: EventRow = {
        id: `evt_${nextId++}`,
        userId: data.userId as string,
        title: data.title as string,
        occasion: (data.occasion as string | null) ?? null,
        startsAt: data.startsAt as Date,
        endsAt: (data.endsAt as Date | null) ?? null,
        allDay: (data.allDay as boolean) ?? false,
        placeText: (data.placeText as string | null) ?? null,
        source: (data.source as "manual" | "google") ?? "manual",
      };
      rows.push(row);
      return eventFields(row);
    },
  },
};

mock.module("@/lib/prisma", () => ({
  getPrisma: () => prismaStub,
}));

const { GET, POST } = await import("./route");

const get = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from !== undefined) params.set("from", from);
  if (to !== undefined) params.set("to", to);
  return GET(
    new Request(`http://localhost/api/aura/calendar/events?${params.toString()}`),
  );
};

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/aura/calendar/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const validEvent = (overrides: Record<string, unknown> = {}) => ({
  title: "Dinner with Sam",
  occasion: "dinner date",
  allDay: false,
  startsAt: "2026-08-12T13:30:00.000Z",
  placeText: "Bandra",
  ...overrides,
});

// The padded week range the client sends for the week of Mon 2026-08-10.
const WEEK_FROM = "2026-08-09T00:00:00.000Z";
const WEEK_TO = "2026-08-18T00:00:00.000Z";

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  nextId = 1;
  nextUserId = 3;
  clerkEmail = "new@example.test";
  lastCreateData = null;
  usersByClerk = { clerk_user_1: "u1", clerk_user_2: "u2" };
  rows = [
    {
      id: "seed_1",
      userId: "u1",
      title: "Team offsite",
      occasion: "work",
      startsAt: new Date("2026-08-12T09:00:00.000Z"),
      endsAt: null,
      allDay: false,
      placeText: "Office",
      source: "manual",
    },
    {
      id: "seed_other",
      userId: "u2",
      title: "Someone else's brunch",
      occasion: "brunch",
      startsAt: new Date("2026-08-12T10:00:00.000Z"),
      endsAt: null,
      allDay: false,
      placeText: null,
      source: "manual",
    },
    {
      id: "seed_out_of_range",
      userId: "u1",
      title: "Last month",
      occasion: "work",
      startsAt: new Date("2026-07-01T09:00:00.000Z"),
      endsAt: null,
      allDay: false,
      placeText: null,
      source: "manual",
    },
  ];
});

describe("GET /api/aura/calendar/events", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    expect((await get(WEEK_FROM, WEEK_TO)).status).toBe(401);
  });

  it("rejects a missing or inverted range", async () => {
    expect((await get()).status).toBe(400);
    expect((await get("not-a-date", WEEK_TO)).status).toBe(400);
    // to must be after from.
    expect((await get(WEEK_TO, WEEK_FROM)).status).toBe(400);
  });

  it("lists only the caller's events within the range, ordered by start", async () => {
    // Add a second in-range event out of chronological order to prove sorting.
    rows.push({
      id: "seed_2",
      userId: "u1",
      title: "Coffee",
      occasion: "casual",
      startsAt: new Date("2026-08-11T08:00:00.000Z"),
      endsAt: null,
      allDay: false,
      placeText: null,
      source: "manual",
    });

    const response = await get(WEEK_FROM, WEEK_TO);
    expect(response.status).toBe(200);
    const body = await response.json();

    // Excludes the other user's event and the out-of-range one; ascending order.
    expect(body.events.map((event: { id: string }) => event.id)).toEqual([
      "seed_2",
      "seed_1",
    ]);
    // Instants are serialised as ISO strings.
    expect(body.events[1]).toMatchObject({
      id: "seed_1",
      title: "Team offsite",
      startsAt: "2026-08-12T09:00:00.000Z",
      endsAt: null,
      source: "manual",
    });
    // An unplanned event carries a null outfit.
    expect(body.events[0].outfit).toBeNull();
  });

  it("serializes a persisted planned outfit so it renders on reload (pure read)", async () => {
    rows[0].outfit = {
      id: "outfit_1",
      provenance: "ai_planned",
      rationale: "A crisp, weather-ready pick.",
      gaps: [{ slot: "formal shoes", note: "No formal shoes in the wardrobe." }],
      updatedAt: new Date("2026-08-11T00:00:00.000Z"),
      items: [
        { position: 1, wardrobeItem: { id: "w2", category: "bottom", name: "Chinos", color: "navy" } },
        { position: 0, wardrobeItem: { id: "w1", category: "top", name: "Oxford shirt", color: "white" } },
      ],
    };

    const response = await get(WEEK_FROM, WEEK_TO);
    const body = await response.json();
    const planned = body.events.find((event: { id: string }) => event.id === "seed_1");

    expect(planned.outfit).toMatchObject({
      id: "outfit_1",
      provenance: "ai_planned",
      rationale: "A crisp, weather-ready pick.",
    });
    // Items are ordered by position.
    expect(planned.outfit.items.map((item: { id: string }) => item.id)).toEqual(["w1", "w2"]);
    expect(planned.outfit.gaps).toEqual([
      { slot: "formal shoes", note: "No formal shoes in the wardrobe." },
    ]);
  });
});

describe("POST /api/aura/calendar/events", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    expect((await post(validEvent())).status).toBe(401);
  });

  it("reports unavailable when persistence is not configured", async () => {
    live = false;
    expect((await post(validEvent())).status).toBe(503);
  });

  it("rejects a malformed body", async () => {
    expect((await post(null)).status).toBe(400);
    expect((await post(validEvent({ title: "  " }))).status).toBe(400);
    // A local datetime is not an absolute instant.
    expect((await post(validEvent({ startsAt: "2026-08-12T19:00" }))).status).toBe(400);
  });

  it("adds a manual event and makes it immediately visible in its week", async () => {
    const response = await post(
      validEvent({
        title: "Gallery opening",
        occasion: "art",
        startsAt: "2026-08-13T18:30:00.000Z",
        placeText: "Colaba",
      }),
    );
    expect(response.status).toBe(201);
    const { event } = await response.json();
    expect(event).toMatchObject({
      title: "Gallery opening",
      occasion: "art",
      allDay: false,
      startsAt: "2026-08-13T18:30:00.000Z",
      placeText: "Colaba",
      source: "manual",
    });

    const listed = await (await get(WEEK_FROM, WEEK_TO)).json();
    expect(listed.events.map((e: { title: string }) => e.title)).toContain(
      "Gallery opening",
    );
  });

  it("defaults a blank occasion instead of inferring one from the title", async () => {
    const response = await post(validEvent({ title: "Oncology follow-up", occasion: "" }));
    expect(response.status).toBe(201);
    const { event } = await response.json();
    expect(event.occasion).toBe(DEFAULT_PLANNED_OCCASION);
  });

  it("stores the place raw and never writes the geocoded columns (zero egress)", async () => {
    await post(validEvent({ placeText: "beachside restaurant, Bandra" }));
    // Captured exactly as typed…
    expect(lastCreateData?.placeText).toBe("beachside restaurant, Bandra");
    // …and geocoding has not run: no coordinates, label, or timezone were written.
    for (const column of ["latitude", "longitude", "timezone", "placeLabel"]) {
      expect(lastCreateData).not.toHaveProperty(column);
    }
  });

  it("persists an all-day event and a null place", async () => {
    const response = await post(
      validEvent({
        title: "Public holiday",
        allDay: true,
        startsAt: "2026-08-15T00:00:00.000Z",
        occasion: "",
        placeText: "",
      }),
    );
    expect(response.status).toBe(201);
    const { event } = await response.json();
    expect(event).toMatchObject({ allDay: true, placeText: null });
  });

  it("provisions a first-time participant's user row instead of dead-ending", async () => {
    userId = "clerk_user_new";
    const response = await post(validEvent({ title: "First plan" }));
    expect(response.status).toBe(201);

    const listed = await (await get(WEEK_FROM, WEEK_TO)).json();
    expect(listed.events.map((e: { title: string }) => e.title)).toContain("First plan");
  });
});
