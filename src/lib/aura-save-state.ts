/**
 * Presentation for the try-on result's save bar.
 *
 * Like {@link import("./aura-try-on-state").tryOnPresentation}, this is the pure
 * core pulled out of the React shell: it maps the save lifecycle
 * (idle → saving → saved) plus a `busy` guard down to the flat flags the bar
 * renders, so the state machine is exercisable without a DOM.
 *
 * The three states are deliberately terminal-on-success only: a failed save
 * returns to `idle` (the shell does that on a non-2xx / offline), and **only** a
 * confirmed save reaches `saved`. `busy` is the "half-assembled look" guard —
 * the shell folds in an in-flight generation today and (once the link input
 * lands) an in-flight scrape — and it never gates the terminal state, since a
 * saved look is already settled.
 */

export type SaveState = "idle" | "saving" | "saved";

/** Where the try-on surface links to the Style Book from the save bar. */
export const STYLE_BOOK_HREF = "/aura/style-book";

export type SaveBarPresentation = {
  state: SaveState;
  /** Label for the primary save control. */
  saveLabel: string;
  /** Show the in-progress spinner on the save control. */
  saving: boolean;
  /** Terminal "✓ Saved" state — the bar drops its actions for the confirmation. */
  saved: boolean;
  /** Disable the primary save control (saving, or the composer is busy). */
  saveDisabled: boolean;
  /** Disable the secondary "Generate again" control (only while saving). */
  regenerateDisabled: boolean;
  styleBookHref: string;
  /** "View your Style Book" before saving; "View in Style Book" once saved. */
  styleBookLabel: string;
};

export function saveBarPresentation({
  state,
  busy,
}: {
  state: SaveState;
  /** The composer is mid-assembly (generating, or — post link-input — scraping). */
  busy: boolean;
}): SaveBarPresentation {
  const saving = state === "saving";
  const saved = state === "saved";
  return {
    state,
    saveLabel: saving ? "Saving…" : "Save to Style Book",
    saving,
    saved,
    // A double-click is also deduped by an in-flight ref in the shell; this
    // keeps the control visibly disabled while a save is in flight or the look
    // isn't settled yet.
    saveDisabled: saving || busy,
    regenerateDisabled: saving,
    styleBookHref: STYLE_BOOK_HREF,
    styleBookLabel: saved ? "View in Style Book" : "View your Style Book",
  };
}
