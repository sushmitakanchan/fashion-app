"use client";

import {
  StyleBookReviewPrototype,
  type StyleBookReviewLook,
} from "@/components/aura/style-book-review-prototype";
import { StyleBookPrototypeSwitcher } from "@/components/aura/style-book-prototype-switcher";
import type { StyleBookReviewVariant } from "@/lib/style-book-review-prototype-state";

const DEMO_LOOK: StyleBookReviewLook = {
  id: "prototype-off-duty-layers",
  caption: "Off-duty layers",
  lookImageUrl: "/looks/ootd.png",
  createdAt: "2026-07-24T00:00:00.000Z",
  sources: [
    {
      name: "Tailored coat",
      imageUrl: "/looks/casual.png",
      // A realistic deep-link pin URL — real Saved Looks store the full pin path
      // (e.g. .../pin/1087126797584723580/), never a bare pinterest.com homepage.
      url: "https://in.pinterest.com/pin/1087126797584723580/",
      site: "pinterest",
    },
    { name: "Wide-leg denim", imageUrl: "/looks/journey.png" },
    { name: "Structured bag", imageUrl: "/looks/vacation.png" },
  ],
};

/** Static content only — the real review remains owner-scoped and server-side. */
export function StyleBookReviewDemo({
  variant,
  previewPerfectScore,
  previewSoundLoop,
}: {
  variant: StyleBookReviewVariant;
  previewPerfectScore: boolean;
  previewSoundLoop: boolean;
}) {
  return (
    <>
      <StyleBookReviewPrototype
        look={DEMO_LOOK}
        onBack={() => window.history.back()}
        variant={variant}
        previewPerfectScore={previewPerfectScore}
        previewSoundLoop={previewSoundLoop}
      />
      <StyleBookPrototypeSwitcher current={variant} />
    </>
  );
}
