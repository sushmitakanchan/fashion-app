import type { Metadata } from "next";

import { GRID_SURFACE_STYLE } from "@/lib/grid-surface";
import { ColorAnalysis } from "@/components/color-analysis/color-analysis";

export const metadata: Metadata = {
  title: "Colour analysis",
  description:
    "Colour-science garment recommendations from your own skin tone — undertone, season, and flattering palettes.",
};

// Public teaser: a fully client-side, deterministic colour analysis. No auth,
// no upload to the server — the skin tone is sampled in the browser and run
// through pure colour science (see src/lib/color-science.ts). The screen shares
// the profile's gridded surface so the two read as one system.
export default function ColorsPage() {
  return (
    <main className="min-h-[calc(100vh-4rem)] px-6 py-16" style={GRID_SURFACE_STYLE}>
      <div className="mx-auto w-full max-w-5xl">
        <span className="text-upload-label text-xs tracking-[0.14em] uppercase">
          Your colour analysis
        </span>
        <h1 className="font-heading mt-2 text-3xl tracking-wide text-balance uppercase sm:text-4xl">
          Colours made for you
        </h1>
        <p className="text-muted-foreground mt-3 max-w-2xl text-sm text-pretty">
          Fashion&rsquo;s colour rules, made personal. We read your skin&rsquo;s
          undertone and depth, then use colour-wheel harmonies to recommend
          garment colours that make your complexion pop — all computed on your
          device, nothing uploaded.
        </p>
        <div className="mt-10">
          <ColorAnalysis />
        </div>
      </div>
    </main>
  );
}
