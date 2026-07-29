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
