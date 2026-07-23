"use client";

import * as React from "react";

/**
 * Cycling status captions. Both sets loop rather than marching to a false finish
 * — generation is indeterminate, so neither set ends on a "done" line (the real
 * completion is the upstream reveal / result swap). The portrait set stays close
 * to the literal pipeline (download references, edit a studio portrait) and
 * avoids "body model" / "proportions" (v1 ships a static portrait, not a 3D
 * twin). The try-on set is the surface's own dressing-room narration for wearing
 * a garment onto the already-fixed portrait; it never claims to remeasure a body.
 */
export const PORTRAIT_CAPTIONS = [
  "Gathering your reference photos",
  "Studying your face and pose",
  "Composing your studio portrait",
  "Refining the light and detail",
  "Bringing your AURA into focus",
] as const;

export const TRY_ON_CAPTIONS = [
  "Preparing your look…",
  "Studying the garment…",
  "Tailoring the fit…",
  "Matching the drape…",
  "Perfecting every detail…",
  "Almost runway-ready…",
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
  captions = PORTRAIT_CAPTIONS,
  note,
}: {
  title: string;
  referenceUrl?: string;
  overExistingPortrait?: boolean;
  /** The cycling status vocabulary. Defaults to the portrait pipeline's; the
   * try-on surface passes {@link TRY_ON_CAPTIONS}. */
  captions?: readonly string[];
  /** A persistent line under the title — the surface's own timing/reassurance
   * copy (e.g. try-on's "up to ~2 minutes" note). Also feeds the screen-reader
   * announcement in place of the default one-minute hint. */
  note?: string;
}) {
  const [caption, setCaption] = React.useState(0);
  const reduceMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(
      () => setCaption((current) => (current + 1) % captions.length),
      CAPTION_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion, captions.length]);

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
          spam the live region). The surface's own note (try-on's longer wait)
          replaces the default one-minute hint when present. */}
      <p className="sr-only">
        {title}. {note ?? "This usually takes up to a minute."}
      </p>

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

        {/* the forming subject — the person's own reference photo (portrait
            generation) or their saved AURA portrait being dressed (try-on) */}
        {referenceUrl && !overExistingPortrait && (
          // Decorative, transient subject — a downscaled data URI for portraits,
          // the saved portrait URL for try-on. next/image would add no value for
          // a brief loading flash.
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
          {note && (
            <p className="text-brand-ink-foreground/60 mx-auto mt-2 max-w-[24rem] text-xs text-pretty">
              {note}
            </p>
          )}
        </div>

        {/* caption + indeterminate indicator */}
        <div className="relative z-10 row-start-3 grid justify-items-center gap-4 self-end p-6 pb-8 text-center">
          <p
            key={caption}
            className="pl-caption max-w-[16rem] font-serif text-lg text-balance italic"
          >
            {captions[caption]}
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
