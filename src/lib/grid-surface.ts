/**
 * The v5 gridded surface shared by the profile (`/aura`) and colour-analysis
 * (`/colors`) screens. The hatch is drawn from `--upload-grid-line`, which
 * flips ink-on-pink in light mode to cream-on-ink in dark, so this one style
 * covers both themes. The surface colour itself comes from the page's
 * `bg-background`; this only overlays the grid.
 */
export const GRID_SURFACE_STYLE = {
  backgroundImage:
    "linear-gradient(var(--upload-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--upload-grid-line) 1px, transparent 1px)",
  backgroundSize: "42px 42px",
} as const;
