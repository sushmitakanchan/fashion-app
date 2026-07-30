import { beforeEach, describe, expect, it, mock } from "bun:test";

import { WARDROBE_ANALYSIS_POLICY_VERSION } from "@/lib/wardrobe-analysis-policy";

/**
 * Route-level tests for optional AI analysis. The analysis boundary, signed
 * media, Clerk, config, and consent lookup are stubbed at the module boundary so
 * every gate (auth, config, validation, owner-scoped media, active consent) and
 * the per-item editable/needs-review outcomes are observable in the response.
 */

type ConsentRow = { policyVersion: string; withdrawnAt: Date | null } | null;

let userId: string | null = "clerk_user_1";
let live = true;
let consent: ConsentRow = { policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION, withdrawnAt: null };

const signedFor: string[] = [];
const analysedUrls: string[] = [];

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
  isCloudinaryConfigured: () => live,
  isDatabaseConfigured: () => live,
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: {
      findUnique: async ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === "clerk_user_1" ? { id: "u1" } : null,
    },
    wardrobeAnalysisConsent: {
      findUnique: async () => consent,
    },
  }),
}));

mock.module("@/lib/wardrobe-media", () => ({
  signedWardrobeMediaUrl: (publicId: string, format: string) => {
    signedFor.push(`${publicId}.${format}`);
    return { url: `https://media.example.test/${publicId}.${format}?sig=x`, expiresAt: new Date() };
  },
  // Surfaced so this process-wide mock can't shadow the export a co-running
  // import-route test needs.
  uploadWardrobeMedia: async () => ({
    original: { mediaId: "unused", format: "png" },
    normalized: { mediaId: "unused", format: "webp" },
  }),
}));

mock.module("@/lib/wardrobe-analysis", () => ({
  analyzeWardrobeImage: async (url: string) => {
    analysedUrls.push(url);
    // A "bad" image id yields needs-review; everything else a clean suggestion.
    if (url.includes("bad")) return { status: "needs-review", reason: "uncertain" };
    return { status: "suggested", suggestion: { category: "tops", color: "Ivory", brand: null } };
  },
}));

const { POST } = await import("./route");

const owned = (seed: string, owner = "clerk_user_1") => ({
  clientId: seed,
  normalizedMediaId: `fashion-app/wardrobe/${owner}/${seed}/normalized`,
  normalizedMediaFormat: "webp",
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/wardrobe/analyze", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  consent = { policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION, withdrawnAt: null };
  signedFor.length = 0;
  analysedUrls.length = 0;
});

describe("POST /api/wardrobe/analyze", () => {
  it("rejects unauthenticated and unconfigured requests", async () => {
    userId = null;
    expect((await post({ items: [owned("a")] })).status).toBe(401);
    userId = "clerk_user_1";
    live = false;
    expect((await post({ items: [owned("a")] })).status).toBe(503);
  });

  it("rejects an empty or malformed batch", async () => {
    expect((await post({ items: [] })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });

  it("refuses media that isn't the caller's own", async () => {
    const response = await post({ items: [owned("a", "clerk_user_2")] });
    expect(response.status).toBe(403);
    expect(analysedUrls).toHaveLength(0);
  });

  it("requires active consent (missing, withdrawn, or stale policy)", async () => {
    consent = null;
    expect((await post({ items: [owned("a")] })).status).toBe(403);

    consent = { policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION, withdrawnAt: new Date() };
    expect((await post({ items: [owned("a")] })).status).toBe(403);

    consent = { policyVersion: "1999-01-01", withdrawnAt: null };
    const stale = await post({ items: [owned("a")] });
    expect(stale.status).toBe(403);
    await expect(stale.json()).resolves.toMatchObject({ code: "consent-required" });

    // No image was analysed on any consent failure.
    expect(analysedUrls).toHaveLength(0);
  });

  it("analyses only the signed normalized media and returns per-item outcomes", async () => {
    const response = await post({ items: [owned("good1"), owned("bad2")] });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual([
      {
        clientId: "good1",
        status: "suggested",
        suggestion: { category: "tops", color: "Ivory", brand: null },
      },
      { clientId: "bad2", status: "needs-review", reason: "uncertain" },
    ]);

    // Signed the normalized rendition of each item, and analysed those URLs.
    expect(signedFor).toEqual([
      "fashion-app/wardrobe/clerk_user_1/good1/normalized.webp",
      "fashion-app/wardrobe/clerk_user_1/bad2/normalized.webp",
    ]);
    expect(analysedUrls).toHaveLength(2);
  });
});
