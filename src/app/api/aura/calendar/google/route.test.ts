import { beforeEach, describe, expect, it, mock } from "bun:test";

import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-calendar-policy";
import type { GoogleEventImportRecord } from "@/lib/google-calendar-import";
import { GoogleCalendarError } from "@/lib/google-calendar";

/**
 * Route-level tests for the Google Calendar sync. Clerk (auth + the OAuth token
 * mint + metadata) and the network fetch are stubbed at their module boundaries;
 * a store-backed Prisma stub lets "re-sync updates rather than duplicates via
 * externalId" be observed as real state across two POSTs. The pure mapping is
 * covered separately in `google-calendar-import.test.ts` — here the network lib
 * hands back already-mapped records so the route's upsert/scope/metadata
 * behaviour is what's under test.
 */

type EventRow = {
  id: string;
  userId: string;
  externalId: string | null;
  source: "manual" | "google";
  title: string;
  occasion: string | null;
  allDay: boolean;
  startsAt: Date;
  endsAt: Date | null;
  placeText: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

// --- Mutable stub state, reset per test ---
let userId: string | null = "clerk_user_1";
let live = true;
let oauthTokens: Array<{ token: string; scopes: string[] }> = [
  { token: "ya29.test", scopes: [GOOGLE_CALENDAR_SCOPE] },
];
let publicMetadata: Record<string, unknown> = {};
let metadataWrites: Array<Record<string, unknown>> = [];
let syncRecords: GoogleEventImportRecord[] = [];
let listError: GoogleCalendarError | null = null;
let events: EventRow[] = [];
let nextId = 1;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => ({
    primaryEmailAddress: { emailAddress: "u@example.test" },
    fullName: "U",
    imageUrl: null,
  }),
  clerkClient: async () => ({
    users: {
      getUserOauthAccessToken: async () => ({ data: oauthTokens }),
      getUser: async () => ({ publicMetadata }),
      updateUserMetadata: async (
        _id: string,
        params: { publicMetadata: Record<string, unknown> },
      ) => {
        metadataWrites.push(params.publicMetadata);
        publicMetadata = { ...publicMetadata, ...params.publicMetadata };
        return { publicMetadata };
      },
    },
  }),
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isDatabaseConfigured: () => live,
  isCloudinaryConfigured: () => live,
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
}));

mock.module("@/lib/google-calendar", () => ({
  // Re-export the real error class so `instanceof` in the route matches.
  GoogleCalendarError,
  listPrimaryCalendarEvents: async () => {
    if (listError) throw listError;
    return syncRecords;
  },
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: {
      findUnique: async ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === "clerk_user_1" ? { id: "u1" } : null,
      create: async () => ({ id: "u1" }),
    },
    plannedEvent: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; externalId: { in: string[] } };
        select: unknown;
      }) =>
        events
          .filter(
            (e) =>
              e.userId === where.userId &&
              e.externalId !== null &&
              where.externalId.in.includes(e.externalId),
          )
          .map((e) => ({
            externalId: e.externalId,
            placeText: e.placeText,
            source: e.source,
          })),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_externalId: { userId: string; externalId: string } };
        create: Partial<EventRow>;
        update: Partial<EventRow>;
        select: unknown;
      }) => {
        const key = where.userId_externalId;
        const existing = events.find(
          (e) => e.userId === key.userId && e.externalId === key.externalId,
        );
        if (existing) {
          Object.assign(existing, update);
          return { id: existing.id };
        }
        const row: EventRow = {
          id: `e${nextId++}`,
          userId: key.userId,
          externalId: key.externalId,
          source: "google",
          title: "",
          occasion: null,
          allDay: false,
          startsAt: new Date(0),
          endsAt: null,
          placeText: null,
          placeLabel: null,
          latitude: null,
          longitude: null,
          timezone: null,
          ...create,
        };
        events.push(row);
        return { id: row.id };
      },
    },
  }),
}));

const { GET, POST, PUT, DELETE } = await import("./route");

function syncRequest(body: unknown = {}) {
  return new Request("http://localhost/api/aura/calendar/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function record(
  overrides: Partial<GoogleEventImportRecord> & { externalId: string },
): GoogleEventImportRecord {
  return {
    title: "Dinner",
    placeText: "Bandra",
    startsAt: new Date("2026-08-14T14:00:00.000Z"),
    endsAt: new Date("2026-08-14T15:30:00.000Z"),
    allDay: false,
    ...overrides,
  };
}

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  oauthTokens = [{ token: "ya29.test", scopes: [GOOGLE_CALENDAR_SCOPE] }];
  publicMetadata = {};
  metadataWrites = [];
  syncRecords = [];
  listError = null;
  events = [];
  nextId = 1;
});

describe("GET /api/aura/calendar/google — status", () => {
  it("401s when signed out", async () => {
    userId = null;
    expect((await GET()).status).toBe(401);
  });

  it("reports connected when the scope is present", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: true, needsReconnect: false });
  });

  it("reports needsReconnect when a prior connect lost the scope", async () => {
    oauthTokens = [{ token: "ya29.test", scopes: [] }];
    publicMetadata = { googleCalendar: { connectedAt: "2026-08-01T00:00:00.000Z" } };
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: false, needsReconnect: true });
  });

  it("reports a fresh (never-connected) account as not-yet-connected", async () => {
    oauthTokens = [{ token: "ya29.test", scopes: [] }];
    publicMetadata = {};
    const body = await (await GET()).json();
    expect(body).toEqual({ connected: false, needsReconnect: false });
    // Not scoped → no intent recorded.
    expect(metadataWrites).toHaveLength(0);
  });

  it("records connect intent at grant-time (first status read after the grant)", async () => {
    // Scope present, no prior intent → intent captured now, before any sync.
    publicMetadata = {};
    await GET();
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0].googleCalendar).toMatchObject({
      connectedAt: expect.any(String),
      policyVersion: expect.any(Number),
    });
  });

  it("does not re-record intent when it is already on file", async () => {
    publicMetadata = { googleCalendar: { connectedAt: "2026-08-01T00:00:00.000Z" } };
    await GET();
    expect(metadataWrites).toHaveLength(0);
  });
});

describe("POST /api/aura/calendar/google — sync", () => {
  it("401s when signed out", async () => {
    userId = null;
    expect((await POST(syncRequest())).status).toBe(401);
  });

  it("503s when the database is unconfigured", async () => {
    live = false;
    expect((await POST(syncRequest())).status).toBe(503);
  });

  it("403s with reconnect-required when the calendar scope is missing", async () => {
    oauthTokens = [{ token: "ya29.test", scopes: [] }];
    const response = await POST(syncRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("reconnect-required");
  });

  it("imports events unplanned and badged google, and records connect intent", async () => {
    syncRecords = [record({ externalId: "g1" }), record({ externalId: "g2", title: "Lunch" })];
    const response = await POST(syncRequest({ startOfToday: "2026-08-12T00:00:00.000Z" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 2, updated: 0, total: 2 });

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.source === "google")).toBe(true);
    expect(events.every((e) => e.occasion === "Everyday")).toBe(true);
    // Intent recorded so a later scope drop reads as reconnect.
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0].googleCalendar).toMatchObject({
      connectedAt: expect.any(String),
    });
  });

  it("re-sync updates the existing row by externalId rather than duplicating", async () => {
    syncRecords = [record({ externalId: "g1", title: "Dinner" })];
    await POST(syncRequest());
    expect(events).toHaveLength(1);

    // Same externalId, changed title + place → update in place, geocode cleared.
    events[0].latitude = 19.05;
    events[0].longitude = 72.83;
    events[0].placeLabel = "Bandra";
    syncRecords = [record({ externalId: "g1", title: "Dinner (moved)", placeText: "Colaba" })];
    const response = await POST(syncRequest());
    const body = await response.json();

    expect(body).toEqual({ imported: 0, updated: 1, total: 1 });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Dinner (moved)");
    expect(events[0].placeText).toBe("Colaba");
    // The changed place invalidates the cached geocode so weather re-resolves.
    expect(events[0].latitude).toBeNull();
    expect(events[0].placeLabel).toBeNull();
  });

  it("leaves a detached (owner-edited) event untouched on re-sync", async () => {
    // The owner edited this Google import, which detached it to `manual` while
    // keeping its externalId. A re-sync of the same Google event must not clobber
    // those local edits, and must not double-count it.
    events.push({
      id: "e9",
      userId: "u1",
      externalId: "g1",
      source: "manual",
      title: "My own title",
      occasion: "dinner date",
      allDay: false,
      startsAt: new Date("2026-08-14T14:00:00.000Z"),
      endsAt: null,
      placeText: "My own place",
      placeLabel: null,
      latitude: null,
      longitude: null,
      timezone: null,
    });

    syncRecords = [record({ externalId: "g1", title: "Google's title", placeText: "Bandra" })];
    const response = await POST(syncRequest());

    // Skipped: not counted as imported or updated, and left byte-for-byte alone.
    expect(await response.json()).toMatchObject({ imported: 0, updated: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("My own title");
    expect(events[0].placeText).toBe("My own place");
  });

  it("keeps the cached geocode when a re-sync leaves the place unchanged", async () => {
    syncRecords = [record({ externalId: "g1", placeText: "Bandra" })];
    await POST(syncRequest());
    events[0].latitude = 19.05;
    events[0].longitude = 72.83;

    syncRecords = [record({ externalId: "g1", placeText: "Bandra", title: "Dinner v2" })];
    await POST(syncRequest());
    expect(events[0].title).toBe("Dinner v2");
    expect(events[0].latitude).toBe(19.05);
  });

  it("maps an unauthorized Google fault to a reconnect-required 403", async () => {
    syncRecords = [record({ externalId: "g1" })];
    listError = new GoogleCalendarError("unauthorized", "denied");
    const response = await POST(syncRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("reconnect-required");
  });

  it("maps a transient Google fault to a 503", async () => {
    syncRecords = [record({ externalId: "g1" })];
    listError = new GoogleCalendarError("unavailable", "down");
    expect((await POST(syncRequest())).status).toBe(503);
  });

  it("refuses to sync after an in-app disconnect even while the token lingers", async () => {
    // Scope is still present (Google token doubles as sign-in, never deleted),
    // but the user disconnected in-app — honour that forward-only.
    publicMetadata = {
      googleCalendar: {
        connectedAt: "2026-08-01T00:00:00.000Z",
        policyVersion: 1,
        disconnectedAt: "2026-08-10T00:00:00.000Z",
      },
    };
    syncRecords = [record({ externalId: "g1" })];
    const response = await POST(syncRequest());
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("reconnect-required");
    // No import happened.
    expect(events).toHaveLength(0);
  });
});

describe("DELETE /api/aura/calendar/google — disconnect", () => {
  it("401s when signed out", async () => {
    userId = null;
    expect((await DELETE()).status).toBe(401);
  });

  it("disconnects forward-only: flags disconnect and keeps imported events", async () => {
    publicMetadata = {
      googleCalendar: { connectedAt: "2026-08-01T00:00:00.000Z", policyVersion: 1 },
    };
    // An already-imported Google event that must survive the disconnect.
    events.push({
      id: "e1",
      userId: "u1",
      externalId: "g1",
      source: "google",
      title: "Dinner",
      occasion: "Everyday",
      allDay: false,
      startsAt: new Date("2026-08-14T14:00:00.000Z"),
      endsAt: null,
      placeText: "Bandra",
      placeLabel: null,
      latitude: null,
      longitude: null,
      timezone: null,
    });

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, needsReconnect: false });

    // The disconnect is recorded, preserving the original connect moment.
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0].googleCalendar).toMatchObject({
      connectedAt: "2026-08-01T00:00:00.000Z",
      disconnectedAt: expect.any(String),
    });
    // Imported events are untouched — the disconnect is forward-only.
    expect(events).toHaveLength(1);
  });

  it("is idempotent when already disconnected — no second write", async () => {
    publicMetadata = {
      googleCalendar: {
        connectedAt: "2026-08-01T00:00:00.000Z",
        policyVersion: 1,
        disconnectedAt: "2026-08-10T00:00:00.000Z",
      },
    };
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, needsReconnect: false });
    expect(metadataWrites).toHaveLength(0);
  });

  it("is a no-op for a never-connected account with no lingering scope", async () => {
    oauthTokens = [{ token: "ya29.test", scopes: [] }];
    publicMetadata = {};
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, needsReconnect: false });
    expect(metadataWrites).toHaveLength(0);
  });

  it("disconnects a scoped-but-unrecorded token rather than leaving it stuck connected", async () => {
    // Scope present (a prior best-effort intent write never landed) but no
    // metadata record — a real disconnect must still be written, else the card
    // would show "Connected" with a no-op button.
    oauthTokens = [{ token: "ya29.test", scopes: [GOOGLE_CALENDAR_SCOPE] }];
    publicMetadata = {};
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: false, needsReconnect: false });
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0].googleCalendar).toMatchObject({
      disconnectedAt: expect.any(String),
    });
  });
});

describe("PUT /api/aura/calendar/google — reconnect intent", () => {
  it("401s when signed out", async () => {
    userId = null;
    expect((await PUT()).status).toBe(401);
  });

  it("clears a prior disconnect so a lingering scoped token reads as connected", async () => {
    publicMetadata = {
      googleCalendar: {
        connectedAt: "2026-08-01T00:00:00.000Z",
        policyVersion: 1,
        disconnectedAt: "2026-08-10T00:00:00.000Z",
      },
    };
    const response = await PUT();
    expect(response.status).toBe(200);
    // Scope still present + disconnect cleared → connected again.
    expect(await response.json()).toEqual({ connected: true, needsReconnect: false });
    expect(metadataWrites).toHaveLength(1);
    expect(metadataWrites[0].googleCalendar).toMatchObject({
      connectedAt: expect.any(String),
      disconnectedAt: null,
    });
  });
});
