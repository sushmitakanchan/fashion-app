# AURA try-on surface — prototype (source of truth)

This is the high-fidelity description of the try-on surface prototype, the **source of
truth** for [Map: AURA ephemeral try-on (spec-ready) #59](https://github.com/sushmitakanchan/fashion-app/issues/59).
The spec (`/to-spec`) describes this surface; it does not redesign it.

- **Branch:** `codex/issue-56-try-on-surface-prototype`
- **Pinned commit:** `a770edc441b8a8739cca1b9a873ba9b6af4e7229`
- **Code:** `src/components/aura/try-on-surface-prototype.tsx` (the surface),
  gated in `src/app/aura/page.tsx`. (`src/components/aura/prototype-switcher.tsx` is a
  leftover from an earlier multi-variant pass and is unused by the current surface.)
- **Run:** check out the branch → `bun install` → `bun run dev` →
  open `http://localhost:3000/aura?prototype=try-on`. Dev-only: the route is gated to
  non-production and needs no Clerk session; nothing is uploaded or persisted.

## Scope (what this surface is, and is not)

The whole feature: **upload a garment image → generate it onto the user's fixed AURA
portrait → display the resulting outfit.** Ephemeral — this session only.

Deliberately **absent** (each was prototyped and cut, or ruled out; do not reintroduce
without a new decision on #59):

- **No comparison** — no base-vs-look slider, toggle, or side-by-side.
- **No saving** — no save/discard CTA, no "style book"; a future, separate effort.
- **No collection / session gallery** — a generated look is shown, then replaced by the
  next generation. No list of past looks.
- **No persistence** — no DB row, no Cloudinary write for the garment or the result.
- **No garment sourcing** — no catalog/tagging/library; a plain single-image upload is
  the only input.

## Layout

Single centered column, `max-w-3xl`, generous padding. Top to bottom:

1. **Header** — a `Prototype — not product UI` badge; a dev-only checkbox
   *"simulate: next generate fails"* (right-aligned); `h1` **"Try on a look"**; subtitle
   *"Attach a garment image and see it worn on your AURA portrait. This is a throwaway
   prototype — nothing is uploaded or saved."*
2. **Stage** — shows exactly one of the four states below.
3. **Composer** — the garment attach/generate card; always present beneath the stage.

## The flow & states

**Stage — Empty (first run / no result).** A dashed panel: a placeholder **portrait
tile** + `＋` + an **upload** box, heading *"See a garment on your portrait"*, copy
*"Your AURA portrait is the fixed subject. Attach a garment image and generate the
look."*, and an **Attach a garment** button (opens the file picker).

**Composer (always visible).** Card titled *"Attach a garment"* with a
`one look = one or more pieces` badge.
- Empty: a dashed dropzone button — *"Choose a garment image / You supply the image —
  this isn't a catalog. PNG/JPG."* Opens a hidden `<input type="file" accept="image/*"
  multiple>`.
- With attachments: a row of garment thumbnails (each removable via an `✕`), plus a
  dashed `＋` tile to add more; a line *"N piece(s) · worn together in one result"*; and
  a **Generate look** button.
- **An outfit is one or more garment images worn together → one result** (carries #54).

**Stage — Generating.** Skeleton fill + pulsing sparkle, *"Putting the look together…"*,
*"This can take up to ~2 minutes."* (`aria-busy`, `role=status`, `aria-live=polite`).
In the prototype the delay is a fixed ~1.4s stand-in.

**Stage — Failed.** Dashed panel, destructive alert icon, *"That try-on didn't come
through"*, *"Nothing was saved. You can try the same garment again."*, and a **Try
again** button (re-runs the last attempt). Reached via the dev fail toggle.

**Stage — Result (the outfit).** A `figure`: the generated outfit image displayed
(`object-contain`, capped at `max-h-[70vh]`), with a caption listing the garment
name(s). Uploading a new garment and generating again **replaces** it.

## Behaviours

- Real client-side file selection via `URL.createObjectURL` (multi-select supported);
  remove and add-more before generating.
- Generate → pending → success (display) or failed (retry). Everything is in-memory and
  cleared on reload; no network, no persistence.
- **Prototype stand-ins:** the base subject is a placeholder **portrait tile** (icon +
  "Your AURA portrait"), and the "generated look" shows the uploaded image as a stand-in
  — the real flow renders the *portrait wearing the garment*. Both are called out in-UI.

## Design language (held to the app's system)

Token-driven throughout and **verified in both light and dark** — no hardcoded colours.
`bg-background/-card/-muted/-secondary`, `text-foreground/-muted-foreground`,
`text-primary`, `text-destructive`, `border`, `ring-ring`, `accent-primary`. **One
accent** (blue); `--destructive` only for the failed state. Radius/type from
`globals.css`; components are shadcn `base-nova` (Base UI). Verified: no console errors,
no nested-interactive hydration issues.

## Maps back to the locked/carried decisions on #59

- Portrait-as-input (fixed saved portrait; user attaches the garment).
- Ephemeral, display-only (nothing persisted).
- OpenAI `images.edit` backend; failure taxonomy `refused`/`timeout`/`transient`/
  `invalid-response`/`invalid-garment`; one-active-generation client-side guard.
- The **unvalidated-quality caveat** (#54) still stands: no real try-on has been judged.
