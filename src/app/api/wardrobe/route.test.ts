import { beforeEach, describe, expect, it, mock } from "bun:test";

type WardrobeRow = {
  id: string;
  ownerClerkId: string;
  name: string;
  category: "tops" | "bottoms" | "bags" | "shoes" | "accessories";
  color: string;
  brand: string | null;
  normalizedMediaId: string;
  createdAt: Date;
  deletedAt: Date | null;
};

let userId: string | null = "clerk_user_1";
const items: WardrobeRow[] = [];

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    wardrobeItem: {
      findMany: async ({ where }: { where: { user: { clerkId: string }; deletedAt: null; category?: WardrobeRow["category"] } }) =>
        items
          .filter(
            (item) =>
              item.ownerClerkId === where.user.clerkId &&
              item.deletedAt === null &&
              (!where.category || item.category === where.category),
          )
          .map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            color: item.color,
            brand: item.brand,
            normalizedMediaId: item.normalizedMediaId,
            createdAt: item.createdAt,
          })),
    },
  }),
}));

const { GET } = await import("./route");

const get = (category?: string) =>
  GET(
    new Request(
      `http://localhost/api/wardrobe${category ? `?category=${category}` : ""}`,
    ),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  items.splice(
    0,
    items.length,
    {
      id: "top_1",
      ownerClerkId: "clerk_user_1",
      name: "Linen shirt",
      category: "tops",
      color: "Ivory",
      brand: "AURA",
      normalizedMediaId: "fashion-app/wardrobe/user_1/top_1/normalized",
      createdAt: new Date("2026-07-28T00:00:00Z"),
      deletedAt: null,
    },
    {
      id: "bag_1",
      ownerClerkId: "clerk_user_2",
      name: "Canvas tote",
      category: "bags",
      color: "Tan",
      brand: null,
      normalizedMediaId: "fashion-app/wardrobe/user_2/bag_1/normalized",
      createdAt: new Date("2026-07-27T00:00:00Z"),
      deletedAt: null,
    },
    {
      id: "deleted_1",
      ownerClerkId: "clerk_user_1",
      name: "Archived jacket",
      category: "tops",
      color: "Black",
      brand: null,
      normalizedMediaId: "fashion-app/wardrobe/user_1/deleted_1/normalized",
      createdAt: new Date("2026-07-26T00:00:00Z"),
      deletedAt: new Date("2026-07-29T00:00:00Z"),
    },
  );
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
          normalizedMediaId: "fashion-app/wardrobe/user_1/top_1/normalized",
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
    items.push({
      ...items[0],
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
    const invalid = await get("dresses");
    expect(invalid.status).toBe(400);

    userId = null;
    const anonymous = await get();
    expect(anonymous.status).toBe(401);
  });
});
