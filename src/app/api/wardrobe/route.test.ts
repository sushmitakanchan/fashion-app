import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for the persisted wardrobe: listing (`GET`) and batch save
 * (`POST`). Both drive one store-backed Prisma stub so the acceptance criterion
 * that matters — a saved batch is immediately available through the active
 * wardrobe — is observable end to end (save, then list). The media-ownership
 * rule (`@/lib/wardrobe`) is left real; only Clerk, config, and persistence are
 * stubbed at the module boundary.
 */

type Row = {
  id: string;
  userId: string;
  name: string;
  category: "tops" | "bottoms" | "bags" | "shoes" | "accessories";
  color: string;
  brand: string | null;
  occasion: string | null;
  originalMediaId: string;
  originalMediaFormat: string;
  normalizedMediaId: string;
  normalizedMediaFormat: string;
  createdAt: Date;
  deletedAt: Date | null;
};

let usersByClerk: Record<string, string> = {
  clerk_user_1: "u1",
  clerk_user_2: "u2",
};

let userId: string | null = "clerk_user_1";
let live = true;
let rows: Row[] = [];
let nextId = 1;

let clerkEmail: string | null = "new@example.test";

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
  // Surfaced so this process-wide mock can't shadow the exports a co-running
  // analyze-route test needs.
  isOpenAIConfigured: () => live,
  isOpenAIImageConfigured: () => live,
}));

let nextUserId = 3;

const wardrobeItemStub = {
      findMany: async ({
        where,
      }: {
        where: {
          user: { clerkId: string };
          deletedAt: null;
          category?: Row["category"];
        };
      }) =>
        rows
          .filter(
            (row) =>
              row.userId === usersByClerk[where.user.clerkId] &&
              row.deletedAt === null &&
              (!where.category || row.category === where.category),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            color: row.color,
            brand: row.brand,
            occasion: row.occasion,
            normalizedMediaId: row.normalizedMediaId,
            createdAt: row.createdAt,
          })),
      count: async ({ where }: { where: { userId: string; deletedAt: null } }) =>
        rows.filter(
          (row) => row.userId === where.userId && row.deletedAt === null,
        ).length,
      createManyAndReturn: async ({
        data,
      }: {
        data: Array<Omit<Row, "id" | "createdAt" | "deletedAt">>;
      }) => {
        const created = data.map((item) => {
          const row: Row = {
            ...item,
            id: `item_${nextId++}`,
            createdAt: new Date(`2026-07-29T00:00:0${nextId}Z`),
            deletedAt: null,
          };
          rows.push(row);
          return row;
        });
        return created.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          color: row.color,
          brand: row.brand,
          occasion: row.occasion,
          normalizedMediaId: row.normalizedMediaId,
          createdAt: row.createdAt,
        }));
      },
};

const prismaStub = {
  user: {
    findUnique: async ({ where }: { where: { clerkId: string } }) => {
      const id = usersByClerk[where.clerkId];
      return id ? { id } : null;
    },
    create: async ({ data }: { data: { clerkId: string; email: string } }) => {
      const id = `u${nextUserId++}`;
      usersByClerk[data.clerkId] = id;
      return { id };
    },
  },
  wardrobeItem: wardrobeItemStub,
  // Interactive transaction: hand the callback the same store-backed stub, so
  // the count and insert observe one another as they do in production.
  $transaction: async <T>(fn: (tx: { wardrobeItem: typeof wardrobeItemStub }) => Promise<T>) =>
    fn(prismaStub),
};

mock.module("@/lib/prisma", () => ({
  getPrisma: () => prismaStub,
}));

const { GET, POST } = await import("./route");

const get = (category?: string) =>
  GET(
    new Request(
      `http://localhost/api/wardrobe${category ? `?category=${category}` : ""}`,
    ),
  );

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/wardrobe", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const ownedMedia = (seed: string, owner = "clerk_user_1") => ({
  originalMediaId: `fashion-app/wardrobe/${owner}/${seed}/original`,
  originalMediaFormat: "png",
  normalizedMediaId: `fashion-app/wardrobe/${owner}/${seed}/normalized`,
  normalizedMediaFormat: "webp",
});

const saveItem = (seed: string, overrides: Record<string, unknown> = {}) => ({
  category: "tops",
  name: `Piece ${seed}`,
  color: "Ivory",
  ...ownedMedia(seed),
  ...overrides,
});

beforeEach(() => {
  userId = "clerk_user_1";
  live = true;
  nextId = 1;
  nextUserId = 3;
  clerkEmail = "new@example.test";
  usersByClerk = { clerk_user_1: "u1", clerk_user_2: "u2" };
  rows = [
    {
      id: "top_1",
      userId: "u1",
      name: "Linen shirt",
      category: "tops",
      color: "Ivory",
      brand: "AURA",
      occasion: "office",
      originalMediaId: "fashion-app/wardrobe/clerk_user_1/top_1/original",
      originalMediaFormat: "jpg",
      normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/top_1/normalized",
      normalizedMediaFormat: "webp",
      createdAt: new Date("2026-07-28T00:00:00Z"),
      deletedAt: null,
    },
    {
      id: "bag_1",
      userId: "u2",
      name: "Canvas tote",
      category: "bags",
      color: "Tan",
      brand: null,
      occasion: null,
      originalMediaId: "fashion-app/wardrobe/clerk_user_2/bag_1/original",
      originalMediaFormat: "jpg",
      normalizedMediaId: "fashion-app/wardrobe/clerk_user_2/bag_1/normalized",
      normalizedMediaFormat: "webp",
      createdAt: new Date("2026-07-27T00:00:00Z"),
      deletedAt: null,
    },
    {
      id: "deleted_1",
      userId: "u1",
      name: "Archived jacket",
      category: "tops",
      color: "Black",
      brand: null,
      occasion: null,
      originalMediaId: "fashion-app/wardrobe/clerk_user_1/deleted_1/original",
      originalMediaFormat: "jpg",
      normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/deleted_1/normalized",
      normalizedMediaFormat: "webp",
      createdAt: new Date("2026-07-26T00:00:00Z"),
      deletedAt: new Date("2026-07-29T00:00:00Z"),
    },
  ];
});

describe("GET /api/wardrobe", () => {
  it("lists only the authenticated participant's active wardrobe items", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: "top_1",
          name: "Linen shirt",
          category: "tops",
          color: "Ivory",
          brand: "AURA",
          occasion: "office",
          normalizedMediaId: "fashion-app/wardrobe/clerk_user_1/top_1/normalized",
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns an intentional empty wardrobe for a participant with no items", async () => {
    userId = "clerk_user_3";

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });
  });

  it("filters the authenticated participant's active items by category", async () => {
    rows.push({
      ...rows[0],
      id: "shoe_1",
      name: "White sneakers",
      category: "shoes",
    });

    const response = await get("shoes");

    await expect(response.json()).resolves.toMatchObject({
      items: [{ id: "shoe_1", category: "shoes" }],
    });
  });

  it("rejects an invalid category and unauthenticated requests", async () => {
    const invalid = await get("loungewear");
    expect(invalid.status).toBe(400);

    userId = null;
    const anonymous = await get();
    expect(anonymous.status).toBe(401);
  });
});

describe("POST /api/wardrobe", () => {
  it("rejects an unauthenticated request", async () => {
    userId = null;
    const response = await post({ items: [saveItem("a")] });
    expect(response.status).toBe(401);
  });

  it("reports the batch as unavailable when persistence is not configured", async () => {
    live = false;
    const response = await post({ items: [saveItem("a")] });
    expect(response.status).toBe(503);
  });

  it("rejects an empty or malformed batch", async () => {
    expect((await post({ items: [] })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    // Missing a required confirmed attribute (colour) is a 400.
    expect(
      (await post({ items: [{ ...saveItem("a"), color: "" }] })).status,
    ).toBe(400);
  });

  it("refuses media that does not belong to the caller's wardrobe folder", async () => {
    const foreign = saveItem("a", ownedMedia("a", "clerk_user_2"));
    const response = await post({ items: [foreign] });
    expect(response.status).toBe(403);
    // Nothing persisted.
    const listed = await (await get()).json();
    expect(listed.items).toHaveLength(1);
  });

  it("persists only owner-confirmed attributes and lists them immediately", async () => {
    const response = await post({
      items: [
        saveItem("new1", { name: "Wool coat", category: "tops", color: "Camel", brand: "AURA", occasion: "office" }),
        saveItem("new2", { name: "Leather boots", category: "shoes", color: "Brown" }),
      ],
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ name: "Wool coat", category: "tops", brand: "AURA", occasion: "office" });
    // An unset occasion persists as null, exactly like brand.
    expect(body.items[1]).toMatchObject({ name: "Leather boots", category: "shoes", brand: null, occasion: null });

    // Immediately available through the active wardrobe listing.
    const listed = await (await get()).json();
    const names = listed.items.map((item: { name: string }) => item.name);
    expect(names).toContain("Wool coat");
    expect(names).toContain("Leather boots");
    expect(listed.items).toHaveLength(3); // the seeded shirt plus the two new pieces
  });

  it("provisions a first-time participant's user row instead of dead-ending", async () => {
    userId = "clerk_user_new"; // no seeded user row

    const response = await post({
      items: [
        saveItem("new1", { name: "First piece", ...ownedMedia("new1", "clerk_user_new") }),
      ],
    });

    expect(response.status).toBe(201);
    const listed = await (await get()).json();
    expect(listed.items.map((item: { name: string }) => item.name)).toContain("First piece");
  });

  it("rejects a batch that would exceed the 200 active-item limit", async () => {
    // One active item already seeded for u1; fill to the ceiling.
    for (let i = 0; i < 199; i++) {
      rows.push({
        ...rows[0],
        id: `fill_${i}`,
        normalizedMediaId: `fashion-app/wardrobe/clerk_user_1/fill_${i}/normalized`,
      });
    }
    // 200 active now; even a single addition must be refused.
    const response = await post({ items: [saveItem("a")] });
    expect(response.status).toBe(409);
  });
});
