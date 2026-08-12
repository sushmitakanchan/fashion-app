import { beforeEach, describe, expect, it, mock } from "bun:test";

import { STYLE_PREFERENCE_MAX_LENGTH } from "@/lib/validations";

/**
 * Route-level tests for the style-preference capture (read / upsert). A
 * store-backed Prisma stub lets write-then-read and edit-then-read be observed
 * end to end — "replace in place, one row per user" and "clear returns to
 * absent" are real state transitions, not assertions about call arguments.
 * Mirrors the Smart Planning consent route test.
 */

type PreferenceRow = { userId: string; text: string };

let usersByClerk: Record<string, string> = { clerk_user_1: "u1" };
let preferences: Record<string, PreferenceRow> = {};
let userId: string | null = "clerk_user_1";
let live = true;
let clerkEmail: string | null = "u@example.test";
let nextUserId = 2;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  // `getOrProvisionUserId` reads an email off `currentUser` to create a
  // first-time participant's row; surfaced here so a write can provision.
  currentUser: async () =>
    clerkEmail
      ? { primaryEmailAddress: { emailAddress: clerkEmail }, fullName: "U", imageUrl: null }
      : { primaryEmailAddress: null, fullName: null, imageUrl: null },
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isDatabaseConfigured: () => live,
  // Surfaced so this process-wide mock can't shadow the exports co-running
  // route tests need.
  isCloudinaryConfigured: () => live,
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
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
    stylePreference: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        preferences[where.userId] ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: PreferenceRow;
        update: { text: string };
      }) => {
        const existing = preferences[where.userId];
        const row: PreferenceRow = existing
          ? { ...existing, ...update }
          : { ...create };
        preferences[where.userId] = row;
        return row;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const existed = preferences[where.userId] !== undefined;
        delete preferences[where.userId];
        return { count: existed ? 1 : 0 };
      },
    },
  }),
}));

const { GET, PUT } = await import("./route");

const read = () => GET();
const save = (text: unknown) =>
  PUT(
    new Request("http://localhost/api/aura/calendar/style-preference", {
      method: "PUT",
      body: JSON.stringify({ text }),
    }),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  clerkEmail = "u@example.test";
  nextUserId = 2;
  usersByClerk = { clerk_user_1: "u1" };
  preferences = {};
});

describe("style preference — read", () => {
  it("reports null when the participant has no preference", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: null });
  });

  it("reports null for a participant with no user row at all", async () => {
    userId = "clerk_stranger";
    expect(await (await read()).json()).toEqual({ text: null });
  });

  it("rejects an unauthenticated read", async () => {
    userId = null;
    expect((await read()).status).toBe(401);
  });

  it("reports 503 when persistence is unavailable", async () => {
    live = false;
    expect((await read()).status).toBe(503);
  });
});

describe("style preference — upsert", () => {
  it("writes a preference, then reads it back", async () => {
    const response = await save("Minimal, dark tones.");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Minimal, dark tones." });

    expect(await (await read()).json()).toEqual({ text: "Minimal, dark tones." });
  });

  it("replaces in place on edit — one row per user", async () => {
    await save("First take.");
    await save("Second, sharper take.");

    // The store holds exactly one row for the user, carrying the latest text.
    expect(Object.keys(preferences)).toEqual(["u1"]);
    expect(preferences.u1.text).toBe("Second, sharper take.");
    expect(await (await read()).json()).toEqual({ text: "Second, sharper take." });
  });

  it("trims surrounding whitespace before storing", async () => {
    await save("   Tailored over flowy.   ");
    expect(preferences.u1.text).toBe("Tailored over flowy.");
  });

  it("clears to absent when saved empty — the row is removed", async () => {
    await save("Something to forget.");
    expect(preferences.u1).toBeDefined();

    const response = await save("   ");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: null });
    expect(preferences.u1).toBeUndefined();
    expect(await (await read()).json()).toEqual({ text: null });
  });

  it("clearing an already-absent preference is a no-op success", async () => {
    const response = await save("");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: null });
    expect(preferences.u1).toBeUndefined();
  });

  it("provisions a first-time participant's user row on write", async () => {
    userId = "clerk_new";
    const response = await save("New here.");
    expect(response.status).toBe(200);
    expect(usersByClerk.clerk_new).toBeDefined();
  });

  it("rejects text past the soft cap", async () => {
    const response = await save("x".repeat(STYLE_PREFERENCE_MAX_LENGTH + 1));
    expect(response.status).toBe(400);
    // Nothing recorded on rejection.
    expect(preferences.u1).toBeUndefined();
  });

  it("accepts text exactly at the soft cap", async () => {
    const atCap = "x".repeat(STYLE_PREFERENCE_MAX_LENGTH);
    const response = await save(atCap);
    expect(response.status).toBe(200);
    expect(preferences.u1.text).toBe(atCap);
  });

  it("rejects a non-string text", async () => {
    expect((await save(42)).status).toBe(400);
    expect(preferences.u1).toBeUndefined();
  });

  it("rejects when unauthenticated or persistence is unavailable", async () => {
    userId = null;
    expect((await save("nope")).status).toBe(401);
    userId = "clerk_user_1";
    live = false;
    expect((await save("nope")).status).toBe(503);
  });
});
