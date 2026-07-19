import { describe, expect, it } from "bun:test";

import { STYLE_BOOK_HREF, saveBarPresentation } from "./aura-save-state";

describe("saveBarPresentation", () => {
  it("offers an enabled save and the Style Book link when idle", () => {
    const p = saveBarPresentation({ state: "idle", busy: false });
    expect(p.saveLabel).toBe("Save to Style Book");
    expect(p.saveDisabled).toBe(false);
    expect(p.regenerateDisabled).toBe(false);
    expect(p.saving).toBe(false);
    expect(p.saved).toBe(false);
    expect(p.styleBookLabel).toBe("View your Style Book");
    expect(p.styleBookHref).toBe(STYLE_BOOK_HREF);
  });

  it("disables save (but not the terminal path) while the composer is busy", () => {
    const p = saveBarPresentation({ state: "idle", busy: true });
    expect(p.saveDisabled).toBe(true);
    // A busy composer never blocks regenerate — that's how you get unstuck.
    expect(p.regenerateDisabled).toBe(false);
    expect(p.saved).toBe(false);
  });

  it("shows a disabled spinner state while saving", () => {
    const p = saveBarPresentation({ state: "saving", busy: false });
    expect(p.saveLabel).toBe("Saving…");
    expect(p.saving).toBe(true);
    expect(p.saveDisabled).toBe(true);
    expect(p.regenerateDisabled).toBe(true);
    expect(p.saved).toBe(false);
  });

  it("flips to the terminal saved confirmation on success", () => {
    const p = saveBarPresentation({ state: "saved", busy: false });
    expect(p.saved).toBe(true);
    expect(p.saving).toBe(false);
    expect(p.styleBookLabel).toBe("View in Style Book");
    expect(p.styleBookHref).toBe(STYLE_BOOK_HREF);
  });

  it("keeps the terminal state even if the composer reports busy", () => {
    // A saved look is already settled — a busy composer for the *next* look must
    // not drag the confirmation back to a disabled-looking state.
    const p = saveBarPresentation({ state: "saved", busy: true });
    expect(p.saved).toBe(true);
  });
});
