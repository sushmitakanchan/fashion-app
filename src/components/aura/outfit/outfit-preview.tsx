"use client";

import * as React from "react";
import { Eye, Loader2, RotateCcw, Shirt, Sparkles } from "lucide-react";

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

  async function generate() {
    setPhase("generating");
    setOpen(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/aura/calendar/events/${eventId}/preview`,
        { method: "POST" },
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
      setPhase("error");
      setErrorMessage("Couldn't reach the server. Please try again.");
    }
  }

  const generating = phase === "generating";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {previewUrl && !open ? (
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
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void generate()}
            disabled={generating}
            className="rounded-full"
          >
            {generating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : previewUrl ? (
              <>
                <RotateCcw />
                Regenerate preview
              </>
            ) : (
              <>
                <Sparkles />
                Generate preview
              </>
            )}
          </Button>
        )}
      </div>

      {open || !previewUrl ? (
        <div className="mx-auto w-full max-w-xs">
          {generating ? (
            <AuraPortraitLoading
              title="Styling your preview"
              captions={TRY_ON_CAPTIONS}
              note="This can take up to ~2 minutes."
            />
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
              <div className="bg-muted aspect-[2/3] w-full overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary preview asset, kept off next/image to avoid a remote-host round-trip here */}
                <img
                  src={previewUrl}
                  alt="Your portrait wearing this outfit"
                  className="size-full object-cover"
                />
              </div>
              <figcaption className="text-muted-foreground text-center text-[11px]">
                Your portrait wearing this outfit
              </figcaption>
            </figure>
          ) : (
            // Idle, no preview yet: a standing placeholder frame cues where the
            // try-on will land, rather than leaving an empty gap by the button.
            <div className="bg-muted/40 text-muted-foreground flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center">
              <Shirt className="size-6 opacity-60" />
              <p className="text-xs text-pretty">
                Generate a preview to see your portrait wearing this look.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
