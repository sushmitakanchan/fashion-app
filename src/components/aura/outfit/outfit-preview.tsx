"use client";

import * as React from "react";
import { Eye, RotateCcw, Shirt, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AuraPortraitLoading,
  TRY_ON_CAPTIONS,
} from "@/components/aura/aura-portrait-loading";
import type { PreviewResponse } from "./types";

/**
 * The on-demand try-on preview for one planned outfit: the saved portrait wearing
 * the outfit, generated server-side and cached to `previewImageUrl` (#169). The
 * outfit-id → preview binding is server-authoritative — this only offers the
 * trigger and shows the result. "Generate preview" (none yet) becomes "See
 * preview" once a preview is cached; "Regenerate preview" re-runs it in place
 * (distinct from the outfit-level Regenerate, which re-plans the pieces). While it
 * generates it reuses the try-on surface's darkroom loading + retry treatment
 * (up to ~2 minutes, per the generator's timeout).
 */
export function OutfitPreview({
  eventId,
  cachedPreviewUrl,
}: {
  eventId: string;
  cachedPreviewUrl: string | null;
}) {
  const [previewUrl, setPreviewUrl] = React.useState(cachedPreviewUrl);
  // A cached preview stays collapsed behind "See preview"; a freshly generated
  // one reveals itself. (A cleared cache remounts this component — see the parent
  // `key` — so there's no stale state to reset here.)
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "generating" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState("");
  // Whether the abort X has been clicked and is awaiting confirmation.
  const [confirmingAbort, setConfirmingAbort] = React.useState(false);
  // Holds the in-flight generation so the abort control can cancel it.
  const abortRef = React.useRef<AbortController | null>(null);

  async function generate() {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("generating");
    setOpen(true);
    setErrorMessage("");
    setConfirmingAbort(false);
    try {
      const response = await fetch(
        `/api/aura/calendar/events/${eventId}/preview`,
        { method: "POST", signal: controller.signal },
      );
      const body = (await response.json().catch(() => null)) as PreviewResponse | null;
      if (!response.ok || !body?.previewImageUrl) {
        setPhase("error");
        setErrorMessage(body?.error ?? "We couldn't generate this preview. Please try again.");
        return;
      }
      setPreviewUrl(body.previewImageUrl);
      setPhase("idle");
    } catch {
      // A deliberate abort is a cancel, not a failure — abortGenerate() has
      // already reset the phase, so don't overwrite it with the error card.
      if (controller.signal.aborted) return;
      setPhase("error");
      setErrorMessage("Couldn't reach the server. Please try again.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // Cancel an in-flight generation and fall back to the last stable state: the
  // existing preview if we were regenerating, otherwise the idle tile. Only the
  // client wait is stopped — the server request may still finish and cache its
  // result, and since `previewImageUrl` is server-authoritative a later "See
  // preview" (after the parent remounts on fresh data) will still surface it.
  function abortGenerate() {
    abortRef.current?.abort();
    setConfirmingAbort(false);
    setPhase("idle");
  }

  const generating = phase === "generating";

  return (
    <div className="space-y-2">
      {/* A cached preview stays collapsed behind "See preview"; regenerating it
          is an icon on the open preview itself (below), not a button here. */}
      {previewUrl && !open ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="rounded-full"
          >
            <Eye />
            See preview
          </Button>
        </div>
      ) : null}

      {open || !previewUrl ? (
        <div className="mx-auto w-full max-w-xs">
          {generating ? (
            <div className="relative">
              <AuraPortraitLoading
                title="Styling your preview"
                captions={TRY_ON_CAPTIONS}
                note="This can take up to ~2 minutes."
              />
              {confirmingAbort ? (
                // Confirm before aborting: aborting throws away the in-flight
                // generation, so guard it behind an explicit choice in place.
                <div className="bg-background/85 absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl p-6 text-center backdrop-blur-sm">
                  <p className="text-sm font-medium">Stop generating this preview?</p>
                  <p className="text-muted-foreground text-xs text-pretty">
                    The preview won&apos;t be saved.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmingAbort(false)}
                      className="rounded-full"
                    >
                      Keep going
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={abortGenerate}
                      className="rounded-full"
                    >
                      Stop
                    </Button>
                  </div>
                </div>
              ) : (
                // Ask to abort the in-flight generation; confirming drops back to
                // the idle tile (or the existing preview when regenerating).
                <button
                  type="button"
                  onClick={() => setConfirmingAbort(true)}
                  aria-label="Stop generating preview"
                  className="bg-background/80 text-muted-foreground hover:text-destructive absolute top-2.5 right-2.5 z-10 grid size-6 place-items-center rounded-full backdrop-blur-sm transition"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ) : phase === "error" ? (
            <div className="border-destructive/40 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
              <p className="text-sm font-medium">We couldn&apos;t generate this preview</p>
              <p className="text-muted-foreground text-xs text-pretty">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void generate()}
                className="rounded-full"
              >
                <RotateCcw />
                Try again
              </Button>
            </div>
          ) : previewUrl ? (
            <figure className="space-y-1.5">
              <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary preview asset, kept off next/image to avoid a remote-host round-trip here */}
                <img
                  src={previewUrl}
                  alt="Your portrait wearing this outfit"
                  className="size-full object-cover"
                />
                {/* Regenerate in place — an icon on the preview, not a separate
                    button. Clicking it swaps the image for the darkroom loader. */}
                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={generating}
                  aria-label="Regenerate preview"
                  className="bg-brand-ink/55 hover:bg-brand-ink/80 focus-visible:ring-ring absolute top-2 right-2 grid size-8 place-items-center rounded-full text-white backdrop-blur-sm transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                >
                  <RotateCcw className="size-4" />
                </button>
              </div>
              <figcaption className="text-muted-foreground text-center text-[11px]">
                Your portrait wearing this outfit
              </figcaption>
            </figure>
          ) : (
            // Idle, no preview yet: the whole placeholder frame is the trigger,
            // so the full try-on footprint doubles as one large Generate button.
            <button
              type="button"
              onClick={() => void generate()}
              className="group bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border focus-visible:ring-ring/50 flex aspect-[2/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            >
              <Shirt className="size-7 opacity-60 transition-opacity group-hover:opacity-100" />
              <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-4" />
                Generate preview
              </span>
              <span className="text-xs text-pretty">
                See your portrait wearing this look.
              </span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
