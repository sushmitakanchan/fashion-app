export const wardrobeCategories = [
  "all",
  "tops",
  "bottoms",
  "bags",
  "accessories",
] as const;

export type WardrobeCategory = (typeof wardrobeCategories)[number];
export type WardrobeItemCategory = Exclude<WardrobeCategory, "all">;

export type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeItemCategory;
  note: string;
  illustration: "tank" | "tee" | "shirt" | "trousers" | "skirt" | "jeans" | "bag" | "tote" | "shoe" | "watch" | "scarf" | "glasses";
  tone: "lime" | "magenta" | "ink" | "paper";
};

export const wardrobeItems: WardrobeItem[] = [
  { id: "rib-tank", name: "Rib tank", category: "tops", note: "Cream", illustration: "tank", tone: "paper" },
  { id: "weekend-tee", name: "Weekend tee", category: "tops", note: "Cherry red", illustration: "tee", tone: "magenta" },
  { id: "pinstripe-shirt", name: "Pinstripe shirt", category: "tops", note: "Blue stripe", illustration: "shirt", tone: "lime" },
  { id: "silk-shirt", name: "Silk shirt", category: "tops", note: "Espresso", illustration: "shirt", tone: "ink" },
  { id: "wide-leg", name: "Wide-leg trouser", category: "bottoms", note: "Stone", illustration: "trousers", tone: "paper" },
  { id: "denim-maxi", name: "Denim maxi", category: "bottoms", note: "Indigo", illustration: "skirt", tone: "ink" },
  { id: "straight-jeans", name: "Straight jeans", category: "bottoms", note: "Washed blue", illustration: "jeans", tone: "lime" },
  { id: "mini-skirt", name: "Mini skirt", category: "bottoms", note: "Cherry red", illustration: "skirt", tone: "magenta" },
  { id: "everyday-bag", name: "Everyday bag", category: "bags", note: "Chocolate", illustration: "bag", tone: "ink" },
  { id: "market-tote", name: "Market tote", category: "bags", note: "Canvas", illustration: "tote", tone: "paper" },
  { id: "leather-loafer", name: "Leather loafer", category: "accessories", note: "Black", illustration: "shoe", tone: "ink" },
  { id: "gold-watch", name: "Gold watch", category: "accessories", note: "Everyday", illustration: "watch", tone: "lime" },
  { id: "silk-scarf", name: "Silk scarf", category: "accessories", note: "Berry print", illustration: "scarf", tone: "magenta" },
  { id: "round-sunglasses", name: "Round sunglasses", category: "accessories", note: "Tortoise", illustration: "glasses", tone: "paper" },
];

export function getWardrobeItems(category: WardrobeCategory): WardrobeItem[] {
  return category === "all"
    ? wardrobeItems
    : wardrobeItems.filter((item) => item.category === category);
}
