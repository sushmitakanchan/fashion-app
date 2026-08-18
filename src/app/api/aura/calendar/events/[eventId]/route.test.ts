import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for editing and hard-deleting a planned event. A store-backed
 * Prisma stub proves the properties that matter: an edit/delete actually mutates
 * the row and is owner-scoped (one participant can never touch another's event,
 * which surfaces as a 404, not a cross-account write); editing a Google-imported
 * event detaches it to `manual` so re-sync leaves it alone; and a changed place
 * clears the cached geocode so weather re-resolves.
 */

type EventRow = {
  id: string;
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
  source: "manual" | "google";
  externalId: string | null;
  outfit: null;
};

function seedRow(overrides: Partial<EventRow>): EventRow {
  return {
    id: "evt_1",
    userId: "u1",
    title: "Dinner",
    occasion: "Everyday",
    startsAt: new Date("2026-08-20T13:00:00.000Z"),
    endsAt: null,
    allDay: false,
    placeText: null,
    placeLabel: null,
    latitude: null,
    longitude: null,
    timezone: null,
    source: "manual",
    externalId: null,
    outfit: null,
    ...overrides,
  };
}

let usersByClerk: Record<string, string> = {
  clerk_user_1: "u1",
  clerk_user_2: "u2",
};

let userId: string | null = "clerk_user_1";
let rows: EventRow[] = [];

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

const prismaStub = {
  plannedEvent: {
    findFirst: async ({
      where,
    }: {
      where: { id: string; user: { clerkId: string } };
    }) => {
      const owner = usersByClerk[where.user.clerkId];
      return rows.find((r) => r.id === where.id && r.userId === owner) ?? null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<EventRow>;
    }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== where.id);
      return { id: where.id };
    },
  },
};

mock.module("@/lib/prisma", () => ({
  getPrisma: () => prismaStub,
}));

const { DELETE, PATCH } = await import("./route");

const del = (eventId: string) =>
  DELETE(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ eventId }) },
  );

const patch = (eventId: string, body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ eventId }) },
  );

const validEdit = (overrides: Record<string, unknown> = {}) => ({
  title: "Dinner (moved)",
  occasion: "dinner date",
  allDay: false,
  startsAt: "2026-08-21T13:00:00.000Z",
  placeText: "Bandra",
  ...overrides,
});

beforeEach(() => {
  userId = "clerk_user_1";
  usersByClerk = { clerk_user_1: "u1", clerk_user_2: "u2" };
  rows = [
    seedRow({ id: "evt_1", userId: "u1", title: "Dinner" }),
    seedRow({ id: "evt_2", userId: "u2", title: "Someone else's plan" }),
  ];
});

describe("DELETE /api/aura/calendar/events/[eventId]", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    expect((await del("evt_1")).status).toBe(401);
    expect(rows).toHaveLength(2); // nothing removed
  });

  it("hard-deletes the owner's event", async () => {
    const response = await del("evt_1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "evt_1" });
    expect(rows.map((r) => r.id)).toEqual(["evt_2"]);
  });

  it("404s a foreign event and leaves it untouched", async () => {
    // clerk_user_1 cannot delete clerk_user_2's event.
    const response = await del("evt_2");
    expect(response.status).toBe(404);
    expect(rows.map((r) => r.id)).toEqual(["evt_1", "evt_2"]);
  });

  it("404s an unknown id", async () => {
    expect((await del("nope")).status).toBe(404);
  });
});

describe("PATCH /api/aura/calendar/events/[eventId]", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    expect((await patch("evt_1", validEdit())).status).toBe(401);
  });

  it("400s an invalid body without touching the row", async () => {
    const response = await patch("evt_1", { title: "" });
    expect(response.status).toBe(400);
    expect(rows[0]?.title).toBe("Dinner");
  });

  it("404s a foreign event and leaves it untouched", async () => {
    const response = await patch("evt_2", validEdit());
    expect(response.status).toBe(404);
    expect(rows[1]?.title).toBe("Someone else's plan");
  });

  it("edits the owner's event and echoes the saved shape", async () => {
    const response = await patch("evt_1", validEdit());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { event: { title: string; occasion: string; placeText: string } };
    expect(body.event.title).toBe("Dinner (moved)");
    expect(body.event.occasion).toBe("dinner date");
    expect(body.event.placeText).toBe("Bandra");
    expect(rows[0]?.startsAt.toISOString()).toBe("2026-08-21T13:00:00.000Z");
  });

  it("defaults a blank occasion rather than storing an empty string", async () => {
    await patch("evt_1", validEdit({ occasion: "" }));
    expect(rows[0]?.occasion).toBe("Everyday");
  });

  it("detaches a Google-imported event to manual so re-sync leaves it alone", async () => {
    rows[0] = seedRow({
      id: "evt_1",
      userId: "u1",
      source: "google",
      externalId: "g_123",
    });
    await patch("evt_1", validEdit());
    expect(rows[0]?.source).toBe("manual");
    expect(rows[0]?.externalId).toBe("g_123"); // kept: Postgres treats it as one row
  });

  it("clears the cached geocode when the place changes", async () => {
    rows[0] = seedRow({
      id: "evt_1",
      userId: "u1",
      placeText: "Colaba",
      latitude: 18.9,
      longitude: 72.8,
      timezone: "Asia/Kolkata",
      placeLabel: "Colaba, Mumbai",
    });
    await patch("evt_1", validEdit({ placeText: "Bandra" }));
    expect(rows[0]?.latitude).toBeNull();
    expect(rows[0]?.longitude).toBeNull();
    expect(rows[0]?.timezone).toBeNull();
    expect(rows[0]?.placeLabel).toBeNull();
  });

  it("keeps the cached geocode when the place is unchanged", async () => {
    rows[0] = seedRow({
      id: "evt_1",
      userId: "u1",
      placeText: "Colaba",
      latitude: 18.9,
      longitude: 72.8,
      timezone: "Asia/Kolkata",
    });
    await patch("evt_1", validEdit({ placeText: "Colaba" }));
    expect(rows[0]?.latitude).toBe(18.9);
    expect(rows[0]?.timezone).toBe("Asia/Kolkata");
  });
});
