import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * The recovery-window expiry worker, exercised at its externally observable
 * behaviour: which items it selects, that both private media objects and the
 * record are removed, that a failure leaves an item for a later run (retry
 * safety), and that active or still-recoverable items are never touched.
 *
 * Prisma and Cloudinary are stubbed at the module seam — the *real*
 * {@link destroyWardrobeMedia} runs against a stubbed uploader, so this also
 * exercises the media boundary the worker depends on. The Prisma stub is
 * store-backed so selection and preservation are visible from what actually
 * remains, not from call arguments alone. (Mocking Cloudinary rather than
 * `@/lib/wardrobe-media` keeps this file compatible with the media lib's own
 * test in a shared test process — neither mocks a module the other needs real.)
 */

type Row = {
  id: string;
  originalMediaId: string;
  normalizedMediaId: string;
  deletedAt: Date | null;
  recoveryExpiresAt: Date | null;
};

let rows: Row[] = [];
let destroyed: string[] = [];
// publicIds whose destroy throws, and item ids whose record delete throws.
let destroyFails: Set<string>;
let deleteFails: Set<string>;

const NOW = new Date("2026-08-30T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    wardrobeItem: {
      findMany: async ({
        where,
      }: {
        where: { deletedAt: { not: null }; recoveryExpiresAt: { lte: Date } };
      }) =>
        rows
          .filter(
            (row) =>
              row.deletedAt !== null &&
              row.recoveryExpiresAt !== null &&
              row.recoveryExpiresAt <= where.recoveryExpiresAt.lte,
          )
          .map((row) => ({
            id: row.id,
            originalMediaId: row.originalMediaId,
            normalizedMediaId: row.normalizedMediaId,
          })),
      delete: async ({ where }: { where: { id: string } }) => {
        if (deleteFails.has(where.id)) throw new Error(`delete failed for ${where.id}`);
        const index = rows.findIndex((row) => row.id === where.id);
        if (index >= 0) rows.splice(index, 1);
        return {};
      },
    },
  }),
}));

// The full module surface, so this process-wide mock never leaves another test
// file that shares the process with a missing `@/lib/cloudinary` export.
mock.module("@/lib/cloudinary", () => ({
  uploadImage: async () => {
    throw new Error("uploadImage is not stubbed for this test");
  },
  cloudinary: {
    uploader: {
      // A failing publicId reports a non-terminal result, which the real
      // destroyWardrobeMedia turns into a throw — a genuine failure to retry.
      destroy: async (publicId: string) => {
        if (destroyFails.has(publicId)) return { result: "error" };
        destroyed.push(publicId);
        return { result: "ok" };
      },
      upload: async () => {
        throw new Error("upload is not stubbed for this test");
      },
    },
    utils: { private_download_url: () => "" },
  },
}));

const { expireRecoveredWardrobeItems } = await import("./wardrobe-expiry");

const idsOf = (rows: Row[]) => rows.map((row) => row.id);

beforeEach(() => {
  destroyed = [];
  destroyFails = new Set();
  deleteFails = new Set();
  rows = [
    {
      id: "active_1",
      originalMediaId: "media/active_1/original",
      normalizedMediaId: "media/active_1/normalized",
      deletedAt: null,
      recoveryExpiresAt: null,
    },
    {
      id: "recoverable_1",
      originalMediaId: "media/recoverable_1/original",
      normalizedMediaId: "media/recoverable_1/normalized",
      deletedAt: days(-5),
      recoveryExpiresAt: days(25),
    },
    {
      id: "expired_past",
      originalMediaId: "media/expired_past/original",
      normalizedMediaId: "media/expired_past/normalized",
      deletedAt: days(-31),
      recoveryExpiresAt: days(-1),
    },
    {
      id: "expired_boundary",
      originalMediaId: "media/expired_boundary/original",
      normalizedMediaId: "media/expired_boundary/normalized",
      deletedAt: days(-30),
      // Exactly at `now`: the window has closed, so it is expired.
      recoveryExpiresAt: NOW,
    },
  ];
});

describe("expireRecoveredWardrobeItems", () => {
  it("permanently removes only items whose recovery window has closed", async () => {
    const summary = await expireRecoveredWardrobeItems({ now: NOW });

    expect(summary.examined).toBe(2);
    expect(summary.removed.sort()).toEqual(["expired_boundary", "expired_past"]);
    expect(summary.failed).toEqual([]);
    // Active and still-recoverable items survive; both expired records are gone.
    expect(idsOf(rows).sort()).toEqual(["active_1", "recoverable_1"]);
  });

  it("destroys both private media objects for each expired item", async () => {
    await expireRecoveredWardrobeItems({ now: NOW });

    expect(destroyed.sort()).toEqual(
      [
        "media/expired_boundary/normalized",
        "media/expired_boundary/original",
        "media/expired_past/normalized",
        "media/expired_past/original",
      ].sort(),
    );
  });

  it("never touches the media of active or still-recoverable items", async () => {
    await expireRecoveredWardrobeItems({ now: NOW });

    expect(destroyed).not.toContain("media/active_1/original");
    expect(destroyed).not.toContain("media/recoverable_1/original");
  });

  it("reports an empty run when nothing has expired", async () => {
    rows = rows.filter((row) => row.recoveryExpiresAt === null || row.recoveryExpiresAt > NOW);

    const summary = await expireRecoveredWardrobeItems({ now: NOW });

    expect(summary).toEqual({ examined: 0, removed: [], failed: [] });
    expect(destroyed).toEqual([]);
  });

  it("keeps the record when a media destroy fails, so a later run retries it", async () => {
    destroyFails = new Set(["media/expired_past/original"]);

    const summary = await expireRecoveredWardrobeItems({ now: NOW });

    // The other expired item still completes; the failed one is reported.
    expect(summary.removed).toEqual(["expired_boundary"]);
    expect(summary.failed.map((failure) => failure.id)).toEqual(["expired_past"]);
    // Its record is intact — nothing was half-deleted.
    expect(idsOf(rows)).toContain("expired_past");

    // A later run (media now reachable) finishes the job — retry-safe.
    destroyFails = new Set();
    const retry = await expireRecoveredWardrobeItems({ now: NOW });
    expect(retry.removed).toEqual(["expired_past"]);
    expect(idsOf(rows).sort()).toEqual(["active_1", "recoverable_1"]);
  });

  it("destroys media before the record, so a failed delete cannot orphan media", async () => {
    deleteFails = new Set(["expired_past"]);

    const summary = await expireRecoveredWardrobeItems({ now: NOW });

    // Media was already destroyed even though the record delete failed…
    expect(destroyed).toContain("media/expired_past/original");
    expect(destroyed).toContain("media/expired_past/normalized");
    // …and the record remains for the next run, reported as failed.
    expect(summary.failed.map((failure) => failure.id)).toEqual(["expired_past"]);
    expect(idsOf(rows)).toContain("expired_past");
  });
});
