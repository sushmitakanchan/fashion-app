import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for hard-deleting a planned event. A store-backed Prisma
 * stub proves the two properties that matter: a deletion actually removes the
 * row, and it is owner-scoped — one participant can never delete another's
 * event, which surfaces as a 404 rather than a cross-account write.
 */

type EventRow = { id: string; userId: string; title: string };

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
      const row = rows.find((r) => r.id === where.id && r.userId === owner);
      return row ? { id: row.id } : null;
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

const { DELETE } = await import("./route");

const del = (eventId: string) =>
  DELETE(
    new Request(`http://localhost/api/aura/calendar/events/${eventId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ eventId }) },
  );

beforeEach(() => {
  userId = "clerk_user_1";
  usersByClerk = { clerk_user_1: "u1", clerk_user_2: "u2" };
  rows = [
    { id: "evt_1", userId: "u1", title: "Dinner" },
    { id: "evt_2", userId: "u2", title: "Someone else's plan" },
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
