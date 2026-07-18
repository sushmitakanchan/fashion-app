"use client";

import * as React from "react";
import { SparklesIcon } from "lucide-react";

import type { AuraMode } from "@/lib/aura";

export const AURA_STAGES = [
  "✨ Awakening your Aura...",
  "Analyzing your features...",
  "Understanding your proportions...",
  "Crafting your digital twin...",
  "Almost there...",
] as const;

export const LAST_STAGE = AURA_STAGES.length - 1;

/** How long each message holds before the next one takes over. */
const STAGE_DWELL = 800;

/** How long the final message holds once it's reached. */
const FINAL_HOLD = 700;

/** Wall time for the copy to play all the way through. */
export const STAGES_DURATION = LAST_STAGE * STAGE_DWELL + FINAL_HOLD;

/**
 * Drives the generation copy: every message, in order, each readable.
 *
 * Pegging stages to pipeline milestones instead looks tempting, but the work
 * doesn't pace itself to human reading speed — encoding five photos can finish
 * in under 50ms, which skips whole messages, and a milestone that lands in the
 * same commit as the finish is batched away without ever painting. So the copy
 * runs on its own clock and the caller waits out `STAGES_DURATION`.
 *
 * When the real work outlasts the copy — the usual case, since uploading five
 * photos takes seconds — the last message simply holds until it's done. Nothing
 * here reports progress it hasn't made.
 */
export function useAuraStages() {
  const [stage, setStage] = React.useState<number | null>(null);
  const startedAt = React.useRef(0);
  const generating = stage !== null;

  React.useEffect(() => {
    if (!generating) return;
    const id = setInterval(() => {
      setStage((current) =>
        current === null ? current : Math.min(current + 1, LAST_STAGE),
      );
    }, STAGE_DWELL);
    return () => clearInterval(id);
  }, [generating]);

  const start = React.useCallback(() => {
    startedAt.current = Date.now();
    setStage(0);
  }, []);

  /** Resolves once every message has had its turn on screen. */
  const settle = React.useCallback(async () => {
    const remaining = STAGES_DURATION - (Date.now() - startedAt.current);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }, []);

  const stop = React.useCallback(() => setStage(null), []);

  return { stage, start, settle, stop };
}

export function AuraProgress({
  stage,
  mode = "live",
}: {
  stage: number;
  mode?: AuraMode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-100 flex-col items-center justify-center gap-7 py-16 text-center"
    >
      <div className="relative flex size-20 items-center justify-center">
        <span className="bg-primary/20 absolute inset-0 animate-ping rounded-full" />
        <span className="bg-primary/10 absolute inset-2 animate-pulse rounded-full" />
        <SparklesIcon className="text-primary size-8" />
      </div>

      <div className="grid gap-2">
        {/* Keyed so each message replays the entrance animation. */}
        <p
          key={stage}
          className="animate-in fade-in slide-in-from-bottom-1 text-lg font-medium duration-500"
        >
          {AURA_STAGES[stage]}
        </p>
        <p className="text-muted-foreground text-sm">
          {mode === "preview"
            ? "Fitting your proportions — locally, nothing leaves your browser."
            : "Uploading your photos and fitting your proportions."}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={AURA_STAGES.length}
        aria-valuenow={stage + 1}
        aria-label="Generating your AURA"
        className="bg-muted h-1 w-56 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${((stage + 1) / AURA_STAGES.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
