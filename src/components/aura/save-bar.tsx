"use client";

import Link from "next/link";
import {
  BookmarkIcon,
  CheckIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "lucide-react";

import { saveBarPresentation, type SaveState } from "@/lib/aura-save-state";
import { Button } from "@/components/ui/button";

/**
 * The save affordance under a completed try-on result: a wide bar whose loud
 * primary is "Save to Style Book", with a secondary "Generate again" beside it
 * and the try-on → Style Book link ("View your Style Book"). On a confirmed
 * save it flips to a terminal "✓ Saved" state with a "View in Style Book" link.
 *
 * Purely presentational — the lifecycle, the in-flight dedupe guard, and the
 * network call live in the try-on surface; every derived flag here comes from
 * the pure {@link saveBarPresentation}.
 */
export function SaveBar({
  state,
  busy,
  onSave,
  onRegenerate,
}: {
  state: SaveState;
  /** The composer is mid-assembly (an in-flight generation today). */
  busy: boolean;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  const p = saveBarPresentation({ state, busy });

  if (p.saved) {
    return (
      <div className="border-primary/40 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <p className="text-primary flex items-center gap-2 text-sm font-medium">
          <CheckIcon className="size-4" />
          Saved to your Style Book
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={p.styleBookHref} />}
        >
          <BookmarkIcon />
          {p.styleBookLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-card grid gap-3 rounded-xl border p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="flex-1" onClick={onSave} disabled={p.saveDisabled}>
          {p.saving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <BookmarkIcon />
          )}
          {p.saveLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={p.regenerateDisabled}
        >
          <RotateCcwIcon />
          Generate again
        </Button>
      </div>
      <Link
        href={p.styleBookHref}
        className="text-muted-foreground hover:text-foreground text-center text-xs underline-offset-4 hover:underline"
      >
        {p.styleBookLabel}
      </Link>
    </div>
  );
}
