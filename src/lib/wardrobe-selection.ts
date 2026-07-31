import type { Slot, WardrobeSource } from "./aura-provenance";
import { MAX_TRY_ON_GARMENTS } from "./validations";

/**
 * The pure core of the wardrobe → try-on selection flow, pulled out of the React
 * shells so it is exercisable without a DOM. Two surfaces share it: the wardrobe
 * gallery's select mode (which ids are picked, honouring the cap) and the try-on
 * surface's seeding step (merging the picked ids into the composer it may already
 * hold). The cap is the same {@link MAX_TRY_ON_GARMENTS} the composer enforces,
 * so a selection can never carry more pieces than a look can wear.
 */

/**
 * Parse the `?wardrobe=` handoff parameter into an ordered, de-duplicated list of
 * wardrobe item ids. Blank entries are dropped and the first occurrence of a
 * repeated id wins, so a hand-edited or doubled-up URL can't seed the same piece
 * twice. Returns an empty array for a missing or empty param.
 */
export function parseWardrobeIds(param: string | null | undefined): string[] {
  if (!param) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of param.split(",")) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Serialise a selection back into the handoff parameter value — the inverse of
 * {@link parseWardrobeIds}. Order is preserved so the composer seeds tiles in the
 * order they were picked.
 */
export function serializeWardrobeIds(ids: Iterable<string>): string {
  return Array.from(ids).join(",");
}

/**
 * Toggle one item in a selection, honouring the cap. Removing is always allowed;
 * adding is refused once the selection is full, in which case the set is returned
 * unchanged and `atCap` is `true` so the caller can surface the limit. The input
 * set is never mutated.
 */
export function toggleSelected(
  selected: ReadonlySet<string>,
  id: string,
  cap: number = MAX_TRY_ON_GARMENTS,
): { selected: Set<string>; atCap: boolean } {
  const next = new Set(selected);
  if (next.delete(id)) return { selected: next, atCap: false };
  if (next.size >= cap) return { selected: new Set(selected), atCap: true };
  next.add(id);
  return { selected: next, atCap: false };
}

/**
 * Merge freshly picked wardrobe sources into the composer's existing slots,
 * de-duplicating by `wardrobeItemId` and never exceeding the cap. Duplicates
 * (against a piece already attached, or repeated within `incoming`) are skipped
 * silently; once the cap is reached the remaining incoming sources are dropped
 * and `overflowed` is `true`. Because the cap counts *every* slot — uploads,
 * links, and in-flight scrape ghosts alike — seeding respects room already taken
 * by other garments. The input `existing` array is never mutated.
 */
export function mergeWardrobeSources(
  existing: readonly Slot[],
  incoming: readonly WardrobeSource[],
  cap: number = MAX_TRY_ON_GARMENTS,
): { slots: Slot[]; overflowed: boolean } {
  const attachedIds = new Set(
    existing
      .filter((slot): slot is WardrobeSource => slot.kind === "wardrobe")
      .map((slot) => slot.wardrobeItemId),
  );
  const slots: Slot[] = [...existing];
  let overflowed = false;
  for (const source of incoming) {
    if (attachedIds.has(source.wardrobeItemId)) continue;
    if (slots.length >= cap) {
      overflowed = true;
      break;
    }
    attachedIds.add(source.wardrobeItemId);
    slots.push(source);
  }
  return { slots, overflowed };
}
