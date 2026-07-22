"use client";

import * as React from "react";

/**
 * Honest captions: each maps to work the pipeline genuinely does — download the
 * two references, edit a studio portrait from the face and full-body, render.
 * They deliberately avoid "body model" / "proportions" (v1 ships a static
 * portrait, not a 3D twin) and they loop rather than marching to a false finish.
 */
const CAPTIONS = [
  "Gathering your reference photos",
  "Studying your face and pose",
  "Composing your studio portrait",
  "Refining the light and detail",
  "Bringing your AURA into focus",
] as const;

const CAPTION_INTERVAL_MS = 2800;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia(REDUCED_MOTION_QUERY);
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * The waiting state for AURA portrait generation, staged as a "darkroom" where
 * the portrait forms. The surface is `--brand-ink` — ink on the pink page in
 * light mode, warm-dark on the ink page in dark mode — because an aurora only
 * reads as light being born on a dark ground. Nothing here claims a completion
 * percentage: generation is a single opaque model call, so the aurora is
 * indeterminate and the reveal is triggered by the request resolving upstream.
 *
 * `referenceUrl` is the person's own downscaled full-body reference photo, shown
 * forming into focus — watching yourself resolve is the point. On regeneration
 * (`overExistingPortrait`) the existing portrait sits behind, so the aurora and
 * caption carry the moment over a translucent scrim instead.
 */
export function AuraPortraitLoading({
  title,
  referenceUrl,
  overExistingPortrait = false,
}: {
  title: string;
  referenceUrl?: string;
  overExistingPortrait?: boolean;
}) {
  const [caption, setCaption] = React.useState(0);
  const reduceMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(
      () => setCaption((current) => (current + 1) % CAPTIONS.length),
      CAPTION_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        overExistingPortrait
          ? "bg-brand-ink/80 text-brand-ink-foreground absolute inset-0 grid grid-rows-[1fr_auto] overflow-hidden rounded-xl backdrop-blur-sm"
          : "bg-brand-ink text-brand-ink-foreground relative grid min-h-[28rem] grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl"
      }
    >
      {/* Screen-reader announcement: stable, not the cycling caption (which would
          spam the live region). */}
      <p className="sr-only">{title}. This usually takes up to a minute.</p>

      <div aria-hidden="true" className="contents">
        {/* aurora */}
        <div className="pointer-events-none absolute inset-[-30%] z-0">
          <span
            className="pl-bloom"
            style={{
              width: "70%",
              height: "52%",
              left: "6%",
              top: "12%",
              background: "radial-gradient(circle, var(--brand-lime), transparent 66%)",
              animation: "pl-drift-a 13s ease-in-out infinite",
            }}
          />
          <span
            className="pl-bloom"
            style={{
              width: "66%",
              height: "50%",
              right: "2%",
              top: "30%",
              background: "radial-gradient(circle, var(--brand-magenta), transparent 66%)",
              animation: "pl-drift-b 17s ease-in-out infinite",
            }}
          />
          <span
            className="pl-bloom"
            style={{
              width: "58%",
              height: "46%",
              left: "16%",
              bottom: "6%",
              background: "radial-gradient(circle, #f6cfe0, transparent 66%)",
              animation: "pl-drift-c 15s ease-in-out infinite",
            }}
          />
        </div>

        {/* vignette that settles the edges toward the ink ground */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 40%, transparent 30%, rgba(20,17,15,.35) 78%, rgba(20,17,15,.72) 100%)",
          }}
        />

        {/* the forming subject — the person's own reference photo */}
        {referenceUrl && !overExistingPortrait && (
          // Decorative, transient, already-downscaled data URI — next/image would
          // add no value here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={referenceUrl}
            alt=""
            className="pl-subject pointer-events-none absolute top-[46%] left-1/2 z-[2] w-[56%] -translate-x-1/2 -translate-y-1/2"
          />
        )}

        {/* header */}
        <div className="relative z-10 self-start p-6 text-center">
          <p className="text-sm font-medium tracking-[0.05em]">{title}</p>
        </div>

        {/* caption + indeterminate indicator */}
        <div className="relative z-10 row-start-3 grid justify-items-center gap-4 self-end p-6 pb-8 text-center">
          <p
            key={caption}
            className="pl-caption max-w-[16rem] font-serif text-lg text-balance italic"
          >
            {CAPTIONS[caption]}
          </p>
          <span
            className="pl-indicator relative h-0.5 w-32 overflow-hidden rounded-full"
            style={{ background: "rgba(245,239,227,.14)" }}
          />
        </div>
      </div>
    </div>
  );
}
