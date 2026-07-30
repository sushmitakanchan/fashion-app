import { describe, expect, it } from "bun:test";

import {
  applySuggestion,
  canSave,
  confirmedItemsForSave,
  createReviewState,
  editItem,
  firstIndexNeedingAttention,
  goToIndex,
  healthSummary,
  isItemComplete,
  nextItem,
  prevItem,
  removeItem,
  replaceFailedItem,
  type ImportOutcome,
} from "./wardrobe-import-review";

const media = (seed: string) => ({
  originalMediaId: `fashion-app/wardrobe/user_1/${seed}/original`,
  originalMediaFormat: "jpg",
  normalizedMediaId: `fashion-app/wardrobe/user_1/${seed}/normalized`,
  normalizedMediaFormat: "webp",
});

const ready = (clientId: string, suggestedName?: string): ImportOutcome => ({
  clientId,
  status: "ready",
  media: media(clientId),
  suggestedName,
});

const failed = (clientId: string, reason = "Use a JPEG, PNG, or WebP image"): ImportOutcome => ({
  clientId,
  status: "failed",
  reason,
});

/** A fully confirmed pending item at `id`. */
function confirmed(id: string, name = "Linen shirt") {
  return editItem(createReviewState([ready(id)]), id, {
    category: "tops",
    name,
    color: "Ivory",
  });
}

describe("createReviewState", () => {
  it("maps ready outcomes to editable pending items and failures to failed items", () => {
    const state = createReviewState([ready("a", "Suggested name"), failed("b")]);

    expect(state.currentIndex).toBe(0);
    expect(state.items).toHaveLength(2);

    const [first, second] = state.items;
    expect(first).toMatchObject({
      id: "a",
      status: "pending",
      media: media("a"),
      fields: { category: null, name: "Suggested name", color: "", brand: "" },
    });
    expect(second).toEqual({ id: "b", status: "failed", reason: "Use a JPEG, PNG, or WebP image" });
  });

  it("defaults a pending item's name to empty when the import suggests none", () => {
    const state = createReviewState([ready("a")]);
    expect(state.items[0]).toMatchObject({ fields: { name: "" } });
  });
});

describe("editItem", () => {
  it("updates a pending item's confirmed attributes", () => {
    const state = editItem(createReviewState([ready("a")]), "a", {
      category: "shoes",
      name: "White sneakers",
      color: "White",
      brand: "AURA",
    });

    expect(state.items[0]).toMatchObject({
      fields: { category: "shoes", name: "White sneakers", color: "White", brand: "AURA" },
    });
  });

  it("preserves edits across Previous/Next navigation", () => {
    let state = createReviewState([ready("a"), ready("b")]);
    state = editItem(state, "a", { name: "Edited A" });
    state = editItem(state, "b", { name: "Edited B" });

    state = nextItem(state);
    state = prevItem(state);

    expect(state.currentIndex).toBe(0);
    expect(state.items[0]).toMatchObject({ fields: { name: "Edited A" } });
    expect(state.items[1]).toMatchObject({ fields: { name: "Edited B" } });
  });

  it("ignores edits to a failed or unknown item", () => {
    const state = createReviewState([failed("a")]);
    expect(editItem(state, "a", { name: "nope" })).toEqual(state);
    expect(editItem(state, "missing", { name: "nope" })).toEqual(state);
  });
});

describe("navigation", () => {
  it("clamps goToIndex, nextItem, and prevItem to the valid range", () => {
    const state = createReviewState([ready("a"), ready("b"), ready("c")]);

    expect(goToIndex(state, -5).currentIndex).toBe(0);
    expect(goToIndex(state, 99).currentIndex).toBe(2);
    expect(prevItem(state).currentIndex).toBe(0);
    expect(nextItem(nextItem(nextItem(state))).currentIndex).toBe(2);
  });
});

describe("removeItem", () => {
  it("removes an item and keeps the current index valid", () => {
    let state = createReviewState([ready("a"), failed("b"), ready("c")]);
    state = goToIndex(state, 2); // on "c"

    state = removeItem(state, "b");

    expect(state.items.map((item) => item.id)).toEqual(["a", "c"]);
    expect(state.currentIndex).toBe(1); // still valid, still within range
  });

  it("clamps the index when the last item is removed", () => {
    let state = createReviewState([ready("a"), ready("b")]);
    state = goToIndex(state, 1);

    state = removeItem(state, "b");

    expect(state.items.map((item) => item.id)).toEqual(["a"]);
    expect(state.currentIndex).toBe(0);
  });
});

describe("replaceFailedItem", () => {
  it("swaps a failed item in place for a fresh outcome without moving the cursor", () => {
    let state = createReviewState([ready("a"), failed("b")]);
    state = goToIndex(state, 1);

    state = replaceFailedItem(state, "b", ready("b"));

    expect(state.currentIndex).toBe(1);
    expect(state.items[1]).toMatchObject({ id: "b", status: "pending" });
  });

  it("leaves a non-failed item untouched", () => {
    const state = createReviewState([ready("a")]);
    expect(replaceFailedItem(state, "a", failed("a"))).toEqual(state);
  });
});

describe("health and completeness", () => {
  it("counts ready, incomplete, and failed items", () => {
    let state = createReviewState([ready("a"), ready("b"), failed("c")]);
    state = editItem(state, "a", { category: "tops", name: "Shirt", color: "Ivory" });
    // "b" left incomplete (no category/name/color)

    expect(healthSummary(state)).toEqual({ total: 3, ready: 1, incomplete: 1, failed: 1 });
  });

  it("treats a pending item as complete only with category, name, and colour", () => {
    const base = createReviewState([ready("a")]);
    expect(isItemComplete(base.items[0])).toBe(false);

    const named = editItem(base, "a", { category: "tops", name: "Shirt", color: "Ivory" }).items[0];
    expect(isItemComplete(named)).toBe(true);

    // Brand stays optional.
    const noBrand = editItem(base, "a", { category: "tops", name: "Shirt", color: "Ivory", brand: "" }).items[0];
    expect(isItemComplete(noBrand)).toBe(true);

    const blankName = editItem(base, "a", { category: "tops", name: "   ", color: "Ivory" }).items[0];
    expect(isItemComplete(blankName)).toBe(false);
  });

  it("points health navigation at the first failed item, then the first incomplete", () => {
    let state = createReviewState([ready("a"), ready("b"), failed("c")]);
    state = editItem(state, "a", { category: "tops", name: "Shirt", color: "Ivory" });
    expect(firstIndexNeedingAttention(state)).toBe(2); // failed "c" first

    state = removeItem(state, "c");
    expect(firstIndexNeedingAttention(state)).toBe(1); // incomplete "b"

    state = editItem(state, "b", { category: "bags", name: "Tote", color: "Tan" });
    expect(firstIndexNeedingAttention(state)).toBe(-1); // nothing left
  });
});

describe("canSave", () => {
  it("is false while any import failed", () => {
    let state = createReviewState([ready("a"), failed("b")]);
    state = editItem(state, "a", { category: "tops", name: "Shirt", color: "Ivory" });
    expect(canSave(state)).toBe(false);
  });

  it("is false while any pending item is incomplete", () => {
    const state = createReviewState([ready("a"), ready("b")]);
    expect(canSave(state)).toBe(false);
  });

  it("is false with no items at all", () => {
    expect(canSave(createReviewState([]))).toBe(false);
  });

  it("is true once every failure is removed and every item is complete", () => {
    let state = createReviewState([ready("a"), failed("b")]);
    state = removeItem(state, "b");
    state = editItem(state, "a", { category: "tops", name: "Shirt", color: "Ivory" });
    expect(canSave(state)).toBe(true);
  });
});

describe("applySuggestion", () => {
  it("pre-fills a pending item's category, colour, brand, and occasion, leaving it editable", () => {
    let state = createReviewState([ready("a", "Suggested name")]);
    state = applySuggestion(state, "a", { category: "tops", color: "Ivory", brand: "AURA", occasion: "office" });

    expect(state.items[0]).toMatchObject({
      status: "pending",
      // The suggested name from import is untouched; analysis never names a piece.
      fields: { category: "tops", name: "Suggested name", color: "Ivory", brand: "AURA", occasion: "office" },
    });

    // Still editable afterwards.
    state = editItem(state, "a", { color: "Cream" });
    expect(state.items[0]).toMatchObject({ fields: { color: "Cream" } });
  });

  it("maps null colour/brand/occasion to empty strings (never fabricated)", () => {
    let state = createReviewState([ready("a")]);
    state = applySuggestion(state, "a", { category: "shoes", color: null, brand: null, occasion: null });
    expect(state.items[0]).toMatchObject({ fields: { category: "shoes", color: "", brand: "", occasion: "" } });
  });

  it("ignores a failed or unknown item", () => {
    const state = createReviewState([failed("a")]);
    expect(applySuggestion(state, "a", { category: "bags", color: null, brand: null, occasion: null })).toEqual(state);
    expect(applySuggestion(state, "missing", { category: "bags", color: null, brand: null, occasion: null })).toEqual(state);
  });
});

describe("confirmedItemsForSave", () => {
  it("returns the confirmed attributes and media for each pending item", () => {
    let state = confirmed("a", "Linen shirt");
    state = editItem(state, "a", { brand: "  AURA  " });

    expect(confirmedItemsForSave(state)).toEqual([
      {
        category: "tops",
        name: "Linen shirt",
        color: "Ivory",
        brand: "AURA",
        originalMediaId: media("a").originalMediaId,
        originalMediaFormat: "jpg",
        normalizedMediaId: media("a").normalizedMediaId,
        normalizedMediaFormat: "webp",
      },
    ]);
  });

  it("omits an empty brand entirely", () => {
    const state = confirmed("a");
    const [item] = confirmedItemsForSave(state);
    expect(item.brand).toBeUndefined();
  });

  it("includes a trimmed occasion when set, and omits it when empty", () => {
    let withOccasion = confirmed("a");
    withOccasion = editItem(withOccasion, "a", { occasion: "  dinner date  " });
    expect(confirmedItemsForSave(withOccasion)[0].occasion).toBe("dinner date");

    const noOccasion = confirmed("b");
    expect(confirmedItemsForSave(noOccasion)[0].occasion).toBeUndefined();
  });
});
