export const wardrobeCategories = [
  "all",
  "tops",
  "bottoms",
  "bags",
  "shoes",
  "accessories",
] as const;

export type WardrobeCategory = (typeof wardrobeCategories)[number];
export type WardrobeItemCategory = Exclude<WardrobeCategory, "all">;

export type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeItemCategory;
  note: string;
  imageUrl: string;
};

/** The wardrobe starts empty: every tile represents a piece the visitor added. */
export const wardrobeItems: WardrobeItem[] = [];

const CATEGORY_KEYWORDS: Record<WardrobeItemCategory, readonly string[]> = {
  tops: [
    "blouse",
    "cardigan",
    "hoodie",
    "jacket",
    "shirt",
    "sweater",
    "tank",
    "tee",
    "top",
  ],
  bottoms: [
    "jean",
    "legging",
    "pant",
    "short",
    "skirt",
    "trouser",
  ],
  bags: ["bag", "clutch", "purse", "satchel", "tote"],
  shoes: ["boot", "loafer", "sandal", "shoe", "sneaker", "trainer"],
  accessories: [
    "belt",
    "earring",
    "glasses",
    "hat",
    "necklace",
    "scarf",
    "sunglasses",
    "watch",
  ],
};

/**
 * The local-preview classifier works from the item name. It keeps the user
 * experience testable without claiming a remote image model is available.
 */
export function inferWardrobeCategory(name: string): WardrobeItemCategory {
  const normalized = name.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category as WardrobeItemCategory;
    }
  }

  return "accessories";
}

export function getWardrobeItems(
  category: WardrobeCategory,
  items: WardrobeItem[] = wardrobeItems,
): WardrobeItem[] {
  return category === "all"
    ? items
    : items.filter((item) => item.category === category);
}
