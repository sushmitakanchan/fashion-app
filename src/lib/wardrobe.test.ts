import { describe, expect, test } from "bun:test";

import { getWardrobeItems, wardrobeItems } from "./wardrobe";

describe("getWardrobeItems", () => {
  test("returns every item for the All filter", () => {
    expect(getWardrobeItems("all")).toEqual(wardrobeItems);
  });

  test("returns only items in the selected category", () => {
    const tops = getWardrobeItems("tops");

    expect(tops.length).toBeGreaterThan(0);
    expect(tops.every((item) => item.category === "tops")).toBe(true);
  });
});
