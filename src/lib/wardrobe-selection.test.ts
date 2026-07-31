import { describe, expect, it } from "bun:test";

import type { Link, Slot, Upload, WardrobeSource } from "./aura-provenance";
import { MAX_TRY_ON_GARMENTS } from "./validations";
import {
  mergeWardrobeSources,
  parseWardrobeIds,
  serializeWardrobeIds,
  toggleSelected,
} from "./wardrobe-selection";

function wardrobe(id: string): WardrobeSource {
  return {
    kind: "wardrobe",
    id,
    wardrobeItemId: id,
    name: `Item ${id}`,
    previewUrl: `blob:${id}`,
  };
}

const upload: Upload = {
  kind: "upload",
  id: "u1",
  name: "Shirt",
  file: new File([], "shirt.png"),
  previewUrl: "blob:u1",
};

const ghost: Slot = { kind: "ghost", id: "g1" };

const link: Link = {
  kind: "link",
  id: "l1",
  name: "Dress",
  scrapedImage: "data:image/png;base64,AAAA",
  previewUrl: "data:image/png;base64,AAAA",
  sourceUrl: "https://pinterest.com/x",
  site: "pinterest",
};

describe("parseWardrobeIds", () => {
  it("returns an empty array for a missing or blank param", () => {
    expect(parseWardrobeIds(null)).toEqual([]);
    expect(parseWardrobeIds(undefined)).toEqual([]);
    expect(parseWardrobeIds("")).toEqual([]);
    expect(parseWardrobeIds(" , , ")).toEqual([]);
  });

  it("splits, trims, and drops blank entries", () => {
    expect(parseWardrobeIds("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("de-duplicates, keeping the first occurrence order", () => {
    expect(parseWardrobeIds("a,b,a,c,b")).toEqual(["a", "b", "c"]);
  });

  it("round-trips through serializeWardrobeIds", () => {
    const ids = ["a", "b", "c"];
    expect(parseWardrobeIds(serializeWardrobeIds(ids))).toEqual(ids);
  });
});

describe("toggleSelected", () => {
  it("adds an unselected id", () => {
    const { selected, atCap } = toggleSelected(new Set(["a"]), "b");
    expect([...selected]).toEqual(["a", "b"]);
    expect(atCap).toBe(false);
  });

  it("removes an already-selected id even when at the cap", () => {
    const full = new Set(["a", "b"]);
    const { selected, atCap } = toggleSelected(full, "a", 2);
    expect([...selected]).toEqual(["b"]);
    expect(atCap).toBe(false);
  });

  it("refuses to add past the cap and reports atCap", () => {
    const full = new Set(["a", "b"]);
    const { selected, atCap } = toggleSelected(full, "c", 2);
    expect([...selected]).toEqual(["a", "b"]);
    expect(atCap).toBe(true);
  });

  it("does not mutate the input set", () => {
    const input = new Set(["a"]);
    toggleSelected(input, "b");
    expect([...input]).toEqual(["a"]);
  });

  it("defaults to the try-on garment cap", () => {
    const full = new Set(
      Array.from({ length: MAX_TRY_ON_GARMENTS }, (_, i) => String(i)),
    );
    expect(toggleSelected(full, "extra").atCap).toBe(true);
  });
});

describe("mergeWardrobeSources", () => {
  it("appends fresh sources to existing slots", () => {
    const { slots, overflowed } = mergeWardrobeSources(
      [upload],
      [wardrobe("a"), wardrobe("b")],
    );
    expect(slots.map((s) => s.id)).toEqual(["u1", "a", "b"]);
    expect(overflowed).toBe(false);
  });

  it("skips a piece already attached from the wardrobe", () => {
    const { slots, overflowed } = mergeWardrobeSources(
      [wardrobe("a")],
      [wardrobe("a"), wardrobe("b")],
    );
    expect(slots.map((s) => s.id)).toEqual(["a", "b"]);
    expect(overflowed).toBe(false);
  });

  it("de-duplicates repeats within the incoming list", () => {
    const { slots } = mergeWardrobeSources(
      [],
      [wardrobe("a"), wardrobe("a"), wardrobe("b")],
    );
    expect(slots.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("counts every slot kind against the cap, including ghosts", () => {
    const { slots, overflowed } = mergeWardrobeSources(
      [upload, link, ghost],
      [wardrobe("a"), wardrobe("b")],
      4,
    );
    expect(slots.map((s) => s.id)).toEqual(["u1", "l1", "g1", "a"]);
    expect(overflowed).toBe(true);
  });

  it("does not mutate the existing slots array", () => {
    const existing: Slot[] = [upload];
    mergeWardrobeSources(existing, [wardrobe("a")]);
    expect(existing).toEqual([upload]);
  });
});
