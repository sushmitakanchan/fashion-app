import { beforeEach, describe, expect, it, mock } from "bun:test";

import { WARDROBE_ANALYSIS_POLICY_VERSION } from "@/lib/wardrobe-analysis-policy";

/**
 * Route-level tests for AI-analysis consent (grant / withdraw / read). A store-
 * backed Prisma stub lets grant-then-read and withdraw-then-read be observed end
 * to end, so "records the consenting batch's timestamp and policy version" and
 * "withdrawal affects only future analysis" are testable as real state.
 */

type ConsentRow = {
  userId: string;
  policyVersion: string;
  consentedAt: Date;
  withdrawnAt: Date | null;
};

let usersByClerk: Record<string, string> = { clerk_user_1: "u1" };
let consents: Record<string, ConsentRow> = {};
let userId: string | null = "clerk_user_1";
let live = true;
let clerkEmail: string | null = "u@example.test";
let nextUserId = 2;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () =>
    clerkEmail
      ? { primaryEmailAddress: { emailAddress: clerkEmail }, fullName: "U", imageUrl: null }
      : { primaryEmailAddress: null, fullName: null, imageUrl: null },
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isDatabaseConfigured: () => live,
  // Surfaced so this process-wide mock can't shadow the exports co-running
  // wardrobe route tests need.
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
    wardrobeAnalysisConsent: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        consents[where.userId] ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: ConsentRow;
        update: Partial<ConsentRow>;
      }) => {
        const existing = consents[where.userId];
        // Mirror the DB default: a fresh row's withdrawnAt is null, not absent.
        const row: ConsentRow = existing
          ? { ...existing, ...update }
          : { ...create, withdrawnAt: create.withdrawnAt ?? null };
        consents[where.userId] = row;
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId: string };
        data: Partial<ConsentRow>;
      }) => {
        consents[where.userId] = { ...consents[where.userId], ...data };
        return consents[where.userId];
      },
    },
  }),
}));

const { GET, POST, DELETE } = await import("./route");

const get = () => GET();
const grant = (policyVersion = WARDROBE_ANALYSIS_POLICY_VERSION) =>
  POST(
    new Request("http://localhost/api/wardrobe/analyze/consent", {
      method: "POST",
      body: JSON.stringify({ policyVersion }),
    }),
  );
const withdraw = () => DELETE();

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  clerkEmail = "u@example.test";
  nextUserId = 2;
  usersByClerk = { clerk_user_1: "u1" };
  consents = {};
});

describe("consent — read", () => {
  it("reports inactive with no record and the current policy version", async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({
      active: false,
      policyVersion: null,
      currentPolicyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
    });
  });

  it("rejects an unauthenticated read", async () => {
    userId = null;
    expect((await get()).status).toBe(401);
  });

  it("reports 503 when persistence is unavailable", async () => {
    live = false;
    expect((await get()).status).toBe(503);
  });
});

describe("consent — grant", () => {
  it("records the timestamp and policy version, then reads back active", async () => {
    const response = await grant();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      active: true,
      policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION,
      withdrawnAt: null,
    });
    expect(typeof body.consentedAt).toBe("string");

    const read = await (await get()).json();
    expect(read.active).toBe(true);
  });

  it("provisions a first-time participant's user row", async () => {
    userId = "clerk_new";
    const response = await grant();
    expect(response.status).toBe(200);
    expect(usersByClerk.clerk_new).toBeDefined();
  });

  it("refuses a stale disclosure (policy version mismatch)", async () => {
    const response = await grant("1999-01-01");
    expect(response.status).toBe(400);
    // Nothing recorded.
    expect(consents.u1).toBeUndefined();
  });

  it("rejects when unauthenticated or persistence is unavailable", async () => {
    userId = null;
    expect((await grant()).status).toBe(401);
    userId = "clerk_user_1";
    live = false;
    expect((await grant()).status).toBe(503);
  });
});

describe("consent — withdraw (future only)", () => {
  it("marks consent inactive without erroring, idempotently", async () => {
    await grant();
    const first = await withdraw();
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.active).toBe(false);
    expect(typeof body.withdrawnAt).toBe("string");

    // Reading back stays inactive; withdrawing again is a no-op 200.
    expect((await (await get()).json()).active).toBe(false);
    expect((await withdraw()).status).toBe(200);
  });

  it("re-granting after withdrawal reactivates consent", async () => {
    await grant();
    await withdraw();
    const regrant = await grant();
    expect((await regrant.json()).active).toBe(true);
  });

  it("is a harmless no-op for a participant who never consented", async () => {
    userId = "clerk_never";
    const response = await withdraw();
    expect(response.status).toBe(200);
    expect((await response.json()).active).toBe(false);
  });
});
