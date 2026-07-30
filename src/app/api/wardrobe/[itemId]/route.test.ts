import { beforeEach, describe, expect, it, mock } from "bun:test";

type Category = "tops" | "bottoms" | "bags" | "shoes" | "accessories";

type Row = {
  id: string;
  userId: string;
  category: Category;
  name: string;
  color: string;
  brand: string | null;
  originalMediaId: string;
  originalMediaFormat: string;
  normalizedMediaId: string;
  normalizedMediaFormat: string;
  createdAt: Date;
  deletedAt: Date | null;
  recoveryExpiresAt: Date | null;
};

let userId: string | null = "clerk_user_1";
let rows: Row[] = [];

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => null,
}));

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE: "AURA isn't configured.",
  isDatabaseConfigured: () => true,
}));

const ownerOf = (clerkId: string) =>
  clerkId === "clerk_user_1" ? "u1" : clerkId === "clerk_user_2" ? "u2" : undefined;

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    wardrobeItem: {
      findFirst: async ({ where }: { where: { id: string; user: { clerkId: string }; deletedAt?: null | { not: null } } }) => {
        const owner = ownerOf(where.user.clerkId);
        return rows.find(
          (row) =>
            row.id === where.id &&
            row.userId === owner &&
            (where.deletedAt === undefined ||
              (where.deletedAt === null ? row.deletedAt === null : row.deletedAt !== null)),
        ) ?? null;
      },
      findMany: async ({ where }: { where: { user: { clerkId: string }; deletedAt: null | { not: null }; recoveryExpiresAt?: { gt: Date } } }) =>
        rows
          .filter(
            (row) =>
              row.userId === ownerOf(where.user.clerkId) &&
              (where.deletedAt === null ? row.deletedAt === null : row.deletedAt !== null) &&
              (!where.recoveryExpiresAt ||
                (row.recoveryExpiresAt !== null && row.recoveryExpiresAt > where.recoveryExpiresAt.gt)),
          )
          .map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            color: row.color,
            brand: row.brand,
            normalizedMediaId: row.normalizedMediaId,
            createdAt: row.createdAt,
          })),
      update: async ({ where, data, select }: { where: { id: string }; data: Partial<Row>; select?: Record<string, boolean> }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error("missing row");
        Object.assign(row, data);
        return select
          ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof Row]]))
          : row;
      },
    },
  }),
}));

const { DELETE, PATCH } = await import("./route");
const { POST: restore } = await import("./restore/route");
const { GET: list } = await import("../route");
const { GET: recoverable } = await import("../recoverable/route");

const itemContext = (itemId = "item_1") => ({
  params: Promise.resolve({ itemId }),
});

const patch = (body: unknown, itemId = "item_1") =>
  PATCH(
    new Request(`http://localhost/api/wardrobe/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    itemContext(itemId),
  );

const remove = (itemId = "item_1") =>
  DELETE(new Request(`http://localhost/api/wardrobe/${itemId}`, { method: "DELETE" }), itemContext(itemId));

const restoreItem = (itemId = "item_1") =>
  restore(
    new Request(`http://localhost/api/wardrobe/${itemId}/restore`, { method: "POST" }),
    itemContext(itemId),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  rows = [
    {
      id: "item_1",
      userId: "u1",
      category: "tops",
      name: "Linen shirt",
      color: "Ivory",
      brand: "AURA",
      originalMediaId: "fashion-app/wardrobe/clerk_user_1/item_1/original",
      originalMediaFormat: "jpg",
      normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/item_1/normalized",
      normalizedMediaFormat: "webp",
      createdAt: new Date("2026-07-29T00:00:00Z"),
      deletedAt: null,
      recoveryExpiresAt: null,
    },
    {
      id: "other_item",
      userId: "u2",
      category: "bags",
      name: "Canvas tote",
      color: "Tan",
      brand: null,
      originalMediaId: "fashion-app/wardrobe/clerk_user_2/other_item/original",
      originalMediaFormat: "jpg",
      normalizedMediaId: "fashion-app/wardrobe/clerk_user_2/other_item/normalized",
      normalizedMediaFormat: "webp",
      createdAt: new Date("2026-07-28T00:00:00Z"),
      deletedAt: null,
      recoveryExpiresAt: null,
    },
  ];
});

describe("Wardrobe Item management", () => {
  it("updates only the owner's confirmed attributes", async () => {
    const response = await patch({
      category: "shoes",
      name: "Leather boots",
      color: "Brown",
      brand: "",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: { id: "item_1", category: "shoes", name: "Leather boots", color: "Brown", brand: null },
    });
  });

  it("removes a deleted item from active wardrobe results immediately", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
    expect(rows[0].recoveryExpiresAt).toBeInstanceOf(Date);
    await expect((await list(new Request("http://localhost/api/wardrobe"))).json()).resolves.toEqual({ items: [] });
  });

  it("restores an unexpired deletion without changing its confirmed metadata", async () => {
    await remove();
    const response = await restoreItem();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: { id: "item_1", name: "Linen shirt", category: "tops", color: "Ivory", brand: "AURA" },
    });
    expect(rows[0].deletedAt).toBeNull();
    expect(rows[0].recoveryExpiresAt).toBeNull();
  });

  it("rejects a restore after the recovery window expires", async () => {
    rows[0].deletedAt = new Date();
    rows[0].recoveryExpiresAt = new Date(Date.now() - 1);

    const response = await restoreItem();

    expect(response.status).toBe(410);
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
  });

  it("does not let another participant update, delete, or restore the owner's item", async () => {
    userId = "clerk_user_2";

    expect((await patch({ category: "tops", name: "Changed", color: "Blue" })).status).toBe(404);
    expect((await remove()).status).toBe(404);

    userId = "clerk_user_1";
    await remove();
    userId = "clerk_user_2";
    expect((await restoreItem()).status).toBe(404);
    await expect((await recoverable()).json()).resolves.toEqual({ items: [] });
  });
});
