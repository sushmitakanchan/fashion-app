import type {
  WardrobeItemCategoryValue,
  WardrobeSaveItemInput,
} from "@/lib/validations";

/**
 * The focused review state for one wardrobe import batch — the pure heart of the
 * import-and-confirm flow. It is deliberately UI-agnostic: the client renders one
 * item at a time and edits attributes through these functions, and the server
 * never sees this shape. Every function returns a new state (no mutation), so the
 * React layer can hold it as ordinary state and diff freely.
 *
 * Two invariants carry the acceptance criteria:
 *  - a failed import stays visible and blocks the batch save until it is removed
 *    or replaced, so an incomplete batch can never be saved;
 *  - edits live in the state itself, so navigating away and back never loses them.
 */

/** The two private Cloudinary renditions an import produced for one image. */
export type WardrobeItemMedia = {
  originalMediaId: string;
  originalMediaFormat: string;
  normalizedMediaId: string;
  normalizedMediaFormat: string;
};

/** One per-image result from `POST /api/wardrobe/import`. */
export type ImportOutcome =
  | {
      clientId: string;
      status: "ready";
      media: WardrobeItemMedia;
      /** An optional starter name (e.g. derived from the file). Never a category
       *  or colour — those are the owner's to confirm. */
      suggestedName?: string;
    }
  | {
      clientId: string;
      status: "failed";
      reason: string;
    };

/** The owner-confirmable attributes of one pending item. `category` is `null`
 *  until chosen; `brand` is optional and carried as "" when absent. */
export type ReviewFields = {
  category: WardrobeItemCategoryValue | null;
  name: string;
  color: string;
  brand: string;
};

export type PendingReviewItem = {
  id: string;
  status: "pending";
  media: WardrobeItemMedia;
  fields: ReviewFields;
};

export type FailedReviewItem = {
  id: string;
  status: "failed";
  reason: string;
};

export type ReviewItem = PendingReviewItem | FailedReviewItem;

export type ReviewState = {
  items: ReviewItem[];
  /** Index of the item under review. Always valid when `items` is non-empty;
   *  `0` for an empty batch. */
  currentIndex: number;
};

export type HealthSummary = {
  total: number;
  /** Pending items with every required attribute confirmed. */
  ready: number;
  /** Pending items still missing a required attribute. */
  incomplete: number;
  /** Imports that failed and must be replaced or removed. */
  failed: number;
};

function toReviewItem(outcome: ImportOutcome): ReviewItem {
  if (outcome.status === "failed") {
    return { id: outcome.clientId, status: "failed", reason: outcome.reason };
  }
  return {
    id: outcome.clientId,
    status: "pending",
    media: outcome.media,
    fields: {
      category: null,
      name: outcome.suggestedName ?? "",
      color: "",
      brand: "",
    },
  };
}

/** Build the initial review state from a batch's import outcomes. */
export function createReviewState(outcomes: ImportOutcome[]): ReviewState {
  return { items: outcomes.map(toReviewItem), currentIndex: 0 };
}

/** Clamp an index into `[0, items.length - 1]`, or `0` for an empty batch. */
function clampIndex(items: ReviewItem[], index: number): number {
  if (items.length === 0) return 0;
  return Math.min(Math.max(index, 0), items.length - 1);
}

/** Apply an attribute edit to one pending item. Failed or unknown ids are no-ops
 *  (a failed item has no attributes to edit). */
export function editItem(
  state: ReviewState,
  id: string,
  patch: Partial<ReviewFields>,
): ReviewState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== id || item.status !== "pending") return item;
    changed = true;
    return { ...item, fields: { ...item.fields, ...patch } };
  });
  return changed ? { ...state, items } : state;
}

/** An editable AI categorisation suggestion for one image. Structurally the
 *  optional-analysis output, redeclared here so this client-safe module never
 *  imports the server-only analysis boundary. */
export type ReviewSuggestion = {
  category: WardrobeItemCategoryValue;
  color: string | null;
  brand: string | null;
};

/**
 * Pre-fill a pending item's category, colour, and brand from an AI suggestion.
 * The values are only a starting point — the item stays fully editable, exactly
 * like a manual entry — and a null colour/brand becomes an empty field rather
 * than an invented value. The name is never touched; analysis doesn't name a
 * piece. Failed or unknown ids are no-ops.
 */
export function applySuggestion(
  state: ReviewState,
  id: string,
  suggestion: ReviewSuggestion,
): ReviewState {
  return editItem(state, id, {
    category: suggestion.category,
    color: suggestion.color ?? "",
    brand: suggestion.brand ?? "",
  });
}

export function goToIndex(state: ReviewState, index: number): ReviewState {
  return { ...state, currentIndex: clampIndex(state.items, index) };
}

export function nextItem(state: ReviewState): ReviewState {
  return goToIndex(state, state.currentIndex + 1);
}

export function prevItem(state: ReviewState): ReviewState {
  return goToIndex(state, state.currentIndex - 1);
}

/** Drop an item from the batch (the "remove" half of failed-item recovery, and
 *  the way an owner discards any pending piece), keeping the cursor in range. */
export function removeItem(state: ReviewState, id: string): ReviewState {
  const items = state.items.filter((item) => item.id !== id);
  if (items.length === state.items.length) return state;
  return { items, currentIndex: clampIndex(items, state.currentIndex) };
}

/** Replace a failed item in place with a fresh import outcome (the "replacement"
 *  half of recovery). Non-failed targets are left untouched. */
export function replaceFailedItem(
  state: ReviewState,
  id: string,
  outcome: ImportOutcome,
): ReviewState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== id || item.status !== "failed") return item;
    changed = true;
    return toReviewItem(outcome);
  });
  return changed ? { ...state, items } : state;
}

/** A pending item is complete once it has a category, a non-blank name, and a
 *  non-blank colour. Brand is optional and never gates completeness. */
export function isItemComplete(item: ReviewItem): item is PendingReviewItem {
  return (
    item.status === "pending" &&
    item.fields.category !== null &&
    item.fields.name.trim().length > 0 &&
    item.fields.color.trim().length > 0
  );
}

export function healthSummary(state: ReviewState): HealthSummary {
  let ready = 0;
  let incomplete = 0;
  let failed = 0;
  for (const item of state.items) {
    if (item.status === "failed") failed += 1;
    else if (isItemComplete(item)) ready += 1;
    else incomplete += 1;
  }
  return { total: state.items.length, ready, incomplete, failed };
}

/** The index the health tiles jump to: the first failed item, else the first
 *  incomplete pending item, else `-1` when nothing needs attention. */
export function firstIndexNeedingAttention(state: ReviewState): number {
  const failedIndex = state.items.findIndex((item) => item.status === "failed");
  if (failedIndex !== -1) return failedIndex;
  return state.items.findIndex(
    (item) => item.status === "pending" && !isItemComplete(item),
  );
}

/** Batch save is available only when the batch is non-empty, holds no failed
 *  imports, and every pending item is complete. */
export function canSave(state: ReviewState): boolean {
  return (
    state.items.length > 0 &&
    state.items.every((item) => isItemComplete(item))
  );
}

/** The confirmed payload for `POST /api/wardrobe`. Assumes {@link canSave}; any
 *  non-complete item is skipped defensively so a stray call can't emit a partial
 *  record. */
export function confirmedItemsForSave(state: ReviewState): WardrobeSaveItemInput[] {
  const items: WardrobeSaveItemInput[] = [];
  for (const item of state.items) {
    if (!isItemComplete(item)) continue;
    const brand = item.fields.brand.trim();
    items.push({
      category: item.fields.category as WardrobeItemCategoryValue,
      name: item.fields.name.trim(),
      color: item.fields.color.trim(),
      ...(brand.length > 0 ? { brand } : {}),
      originalMediaId: item.media.originalMediaId,
      originalMediaFormat: item.media.originalMediaFormat,
      normalizedMediaId: item.media.normalizedMediaId,
      normalizedMediaFormat: item.media.normalizedMediaFormat,
    });
  }
  return items;
}
