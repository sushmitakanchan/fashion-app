# 1. Planned outfits track live wardrobe items; saved looks snapshot

Date: 2026-08-08

Status: Accepted

## Context

AURA now has two things that relate a generated/assembled outfit to a
participant's wardrobe, and they answer opposite questions about time.

- A **Saved Look** (`SavedLook`, the Style Book) preserves a *past* moment. It is
  insert-only and immutable: it stores the generated image, an auto-derived
  caption, a **snapshot** of the sources it was built from, and a snapshot of the
  AURA portrait at save time. It stays faithful to that moment even after the
  wardrobe or portrait later changes — that is the whole point of a saved look.
- A **Planned Outfit** (the new Outfit Calendar, spec #170) answers *"what do I
  wear to this upcoming event, from the clothes I own right now?"* Its value is
  that it plans against the **current** wardrobe.

Because the two models look superficially alike (both are "an outfit made of
wardrobe items"), it would be easy to reach for the Saved Look pattern —
snapshotting the chosen items into the planned outfit — and get it subtly wrong.
We need one explicit decision on how a Planned Outfit references wardrobe items
over time, because downstream code (gap-flagging, the try-on preview cache,
"Plan my week") reads that relationship and must agree on what a missing item
*means*.

## Decision

**A Planned Outfit tracks *live* wardrobe items. A Saved Look *snapshots*.**

Concretely, in the Prisma schema:

- `PlannedOutfitItem.wardrobeItem` is a **live foreign key** to `WardrobeItem`
  (`onDelete: Cascade`), **not** a copied snapshot of the item's attributes. The
  planned outfit reflects whatever those items are now.
- `PlannedOutfit` is **mutable** (`updatedAt`, and `previewImageUrl` is cleared
  to `null` whenever the item set changes), unlike the insert-only `SavedLook`
  (which has no `updatedAt`).
- `SavedLook` is unchanged: it keeps snapshotting its `sources` and `portraitUrl`.
- There is **no foreign key between `PlannedOutfit` and `SavedLook`** — they stay
  separate models. Promoting a planned outfit into the Style Book is out of scope
  for v1.

Rejected alternative — *snapshot the items into the planned outfit* (mirror
`SavedLook`): rejected because a snapshot would drift from the real wardrobe. A
planned outfit built on a garment you have since given away would keep showing it
as wearable, and the calendar could never surface an honest "you don't own this
anymore" gap. Snapshotting is right for a record of the past; it is wrong for a
plan about the present.

## Consequences

- **A planned outfit always reflects the current wardrobe.** Edit an item's
  colour or occasion and every plan referencing it updates for free.

- **Key consequence: a planned outfit can become _partial or empty_ as the
  wardrobe changes, and readers MUST treat that as a _gap signal, not
  corruption_.** When a referenced `WardrobeItem` is hard-deleted, the cascade
  removes its `PlannedOutfitItem` row, so the outfit legitimately has fewer items
  than it once did — or none. Code that reads a planned outfit must not treat a
  short/empty item set as an invariant violation or an error; it is exactly the
  coverage-hole signal the UI renders as an amber gap chip (spec #164), and an
  empty pick beside a gap is a legal state.

- **The soft-delete recovery window is what makes gap-flagging graceful.**
  `WardrobeItem` has a recoverable-deletion lifecycle (`deletedAt` /
  `recoveryExpiresAt`): a soft delete only sets a flag; the row — and therefore
  the `PlannedOutfitItem` referencing it — **stays present and referable** during
  the recovery window. So the plan can notice the item is soft-deleted and flag a
  gap while the item is still recoverable, rather than the reference vanishing
  abruptly. Only when the deletion worker later hard-deletes the row does the
  cascade fire. Both paths converge on the same rule: **a missing or unavailable
  item is a gap to surface, never data to panic about.**

- **The preview cache follows the live item set.** Because the items can change
  under a planned outfit, `previewImageUrl` (the on-demand try-on preview) is
  cleared to `null` on any item-set change so a stale preview is never shown for
  a changed outfit.

- **Planned Outfit and Saved Look must not be conflated in code.** They have
  opposite immutability and time semantics; reuse the try-on *generator* and the
  Cloudinary helper for the preview, but do **not** reuse the `SavedLook` model,
  its upload route, or its review/verdict route (spec #170 §6, §20).
