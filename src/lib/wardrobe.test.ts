import { describe, expect, test } from "bun:test";

import {
  isOwnedWardrobeMediaId,
  wardrobeCategories,
  wardrobeMediaFolder,
} from "./wardrobe";

describe("wardrobeCategories", () => {
  test("keeps the UI-only All filter separate from the persisted item categories", () => {
    expect(wardrobeCategories).toEqual([
      "all",
      "tops",
      "bottoms",
      "dresses",
      "activewear",
      "outerwear",
      "bags",
      "shoes",
      "accessories",
    ]);
  });
});

describe("wardrobe media ownership", () => {
  test("scopes an owner's media folder by their key", () => {
    expect(wardrobeMediaFolder("clerk_user_1")).toBe(
      "fashion-app/wardrobe/clerk_user_1",
    );
  });

  test("accepts a media id under the owner's folder", () => {
    expect(
      isOwnedWardrobeMediaId(
        "fashion-app/wardrobe/clerk_user_1/abc123/original",
        "clerk_user_1",
      ),
    ).toBe(true);
  });

  test("rejects another participant's or an arbitrary media id", () => {
    expect(
      isOwnedWardrobeMediaId(
        "fashion-app/wardrobe/clerk_user_2/abc123/original",
        "clerk_user_1",
      ),
    ).toBe(false);
    expect(isOwnedWardrobeMediaId("some/other/asset", "clerk_user_1")).toBe(false);
    // A folder-name prefix that isn't a real path boundary must not slip through.
    expect(
      isOwnedWardrobeMediaId(
        "fashion-app/wardrobe/clerk_user_1evil/x",
        "clerk_user_1",
      ),
    ).toBe(false);
  });
});
