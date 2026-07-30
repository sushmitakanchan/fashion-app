import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { WardrobeExpirySummary } from "@/lib/wardrobe-expiry";

/**
 * The scheduled expiry endpoint. Its own job is authorization (only a caller
 * bearing the configured CRON_SECRET may run the sweep) and translating the
 * summary into a status; the sweep itself is stubbed at the module seam and
 * covered by `src/lib/wardrobe-expiry.test.ts`.
 */

let cronSecret: string | undefined;
let summary: WardrobeExpirySummary;
let expireThrows: boolean;
let expire: ReturnType<typeof mock<() => Promise<WardrobeExpirySummary>>>;

mock.module("@/lib/env", () => ({
  env: {
    get CRON_SECRET() {
      return cronSecret;
    },
  },
}));

mock.module("@/lib/wardrobe-expiry", () => ({
  expireRecoveredWardrobeItems: () => expire(),
}));

const { GET } = await import("./route");

const get = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/wardrobe/expire", {
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  cronSecret = "s3cret";
  summary = { examined: 2, removed: ["a", "b"], failed: [] };
  expireThrows = false;
  expire = mock(async () => {
    if (expireThrows) throw new Error("sweep blew up");
    return summary;
  });
});

describe("GET /api/wardrobe/expire", () => {
  it("runs the sweep and returns the summary for an authorized cron call", async () => {
    const response = await get("Bearer s3cret");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      examined: 2,
      removed: ["a", "b"],
      failed: [],
    });
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it("rejects a caller with no authorization, without running the sweep", async () => {
    const response = await get();

    expect(response.status).toBe(401);
    expect(expire).not.toHaveBeenCalled();
  });

  it("rejects a caller bearing the wrong secret", async () => {
    const response = await get("Bearer wrong");

    expect(response.status).toBe(401);
    expect(expire).not.toHaveBeenCalled();
  });

  it("stays closed when no CRON_SECRET is configured", async () => {
    cronSecret = undefined;

    // Even an empty Bearer must not open the endpoint.
    const response = await get("Bearer ");

    expect(response.status).toBe(401);
    expect(expire).not.toHaveBeenCalled();
  });

  it("surfaces a partially-failed run as a 500 while still reporting it", async () => {
    summary = { examined: 2, removed: ["a"], failed: [{ id: "b", error: "cloudinary down" }] };

    const response = await get("Bearer s3cret");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(summary);
  });

  it("reports a thrown sweep as a 500", async () => {
    expireThrows = true;

    const response = await get("Bearer s3cret");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Wardrobe expiry sweep failed.",
    });
  });
});
