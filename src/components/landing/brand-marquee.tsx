"use client";

import * as React from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

const PHRASE = "AURA studio portraits";

/**
 * v5's scrolling brand band.
 *
 * The mockup runs this as a bare infinite animation, which is a WCAG 2.2.2
 * (Level A) failure: anything that moves on its own for more than five seconds
 * needs a mechanism to stop it. `prefers-reduced-motion` alone doesn't satisfy
 * it — that's a standing OS preference, not a control — so the band ships with
 * a real pause button as well.
 *
 * The text itself is decorative: it repeats a phrase the page already states,
 * so it's hidden from assistive tech and only the control is exposed.
 */
export function BrandMarquee() {
  const [paused, setPaused] = React.useState(false);

  return (
    <div className="bg-brand-magenta text-brand-magenta-foreground relative flex items-center overflow-hidden">
      {/* Two identical tracks. The animation shifts the pair by half its own
          width, so the second lands exactly where the first started. */}
      <div
        aria-hidden="true"
        data-paused={paused || undefined}
        className="animate-aura-marquee flex w-max shrink-0 py-4 data-paused:[animation-play-state:paused] motion-reduce:animate-none"
      >
        {Array.from({ length: 2 }, (_, track) => (
          <div key={track} className="flex">
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className="font-heading px-5 text-base tracking-wide whitespace-nowrap uppercase"
              >
                {PHRASE} •
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Fades the track out before it reaches the control, so the text stops
          at the edge of the band instead of sliding underneath the button. */}
      <span
        aria-hidden="true"
        className="from-brand-magenta pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l to-transparent"
      />

      {/* Ink rather than a translucent black: at bg-black/15 the button's own
          edge sat at 1.29:1 against the band, so the only thing identifying
          the control was the icon inside it. Ink reads at 5.08:1. */}
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={
          paused ? "Play the scrolling banner" : "Pause the scrolling banner"
        }
        className="bg-brand-ink text-brand-ink-foreground focus-visible:ring-brand-ink-foreground absolute right-3 grid size-9 shrink-0 place-items-center rounded-full touch-manipulation hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none"
      >
        {paused ? (
          <PlayIcon className="size-4" aria-hidden="true" />
        ) : (
          <PauseIcon className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
