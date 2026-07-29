import { describe, expect, test } from "bun:test";

import { wardrobeCategories } from "./wardrobe";

describe("wardrobeCategories", () => {
  test("keeps the UI-only All filter separate from the persisted item categories", () => {
    expect(wardrobeCategories).toEqual([
      "all",
      "tops",
      "bottoms",
      "bags",
      "shoes",
      "accessories",
    ]);
  });
});
