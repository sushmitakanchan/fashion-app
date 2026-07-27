import { describe, expect, test } from "bun:test";

import {
  inferWardrobeCategory,
  getWardrobeItems,
  wardrobeItems,
  type WardrobeItem,
} from "./wardrobe";

const sampleItems: WardrobeItem[] = [
  {
    id: "linen-overshirt",
    name: "Linen overshirt",
    category: "tops",
    note: "Added just now",
    imageUrl: "data:image/png;base64,example",
  },
  {
    id: "canvas-tote",
    name: "Canvas tote",
    category: "bags",
    note: "Added just now",
    imageUrl: "data:image/png;base64,example",
  },
];

describe("getWardrobeItems", () => {
  test("returns every item for the All filter", () => {
    expect(getWardrobeItems("all")).toEqual(wardrobeItems);
  });

  test("returns only items in the selected category", () => {
    const tops = getWardrobeItems("tops", sampleItems);

    expect(tops.length).toBeGreaterThan(0);
    expect(tops.every((item) => item.category === "tops")).toBe(true);
  });

  test("infers a category from a garment name", () => {
    expect(inferWardrobeCategory("linen overshirt")).toBe("tops");
    expect(inferWardrobeCategory("wide-leg pants")).toBe("bottoms");
    expect(inferWardrobeCategory("leather shoulder bag")).toBe("bags");
    expect(inferWardrobeCategory("white leather sneakers")).toBe("shoes");
    expect(inferWardrobeCategory("gold hoop earrings")).toBe("accessories");
  });
});
