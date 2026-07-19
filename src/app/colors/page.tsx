import type { Metadata } from "next";

import { ColorAnalysis } from "@/components/color-analysis/color-analysis";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Colour analysis",
  description:
    "Colour-science garment recommendations from your own skin tone — undertone, season, and flattering palettes.",
};

// Public teaser: a fully client-side, deterministic colour analysis. No auth,
// no upload to the server — the skin tone is sampled in the browser and run
// through pure colour science (see src/lib/color-science.ts).
export default function ColorsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Your colour analysis</CardTitle>
          <CardDescription className="text-pretty">
            Fashion&rsquo;s colour rules, made personal. We read your skin&rsquo;s
            undertone and depth, then use colour-wheel harmonies to recommend
            garment colours that make your complexion pop — all computed on your
            device, nothing uploaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ColorAnalysis />
        </CardContent>
      </Card>
    </main>
  );
}
