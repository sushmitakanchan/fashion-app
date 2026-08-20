"use client";

import { CloudSun, Loader2, RefreshCw, Shirt, TriangleAlert } from "lucide-react";

import type { PlannedOutfitDto } from "@/lib/aura-outfit-planner";
import { Button } from "@/components/ui/button";
import { OutfitItemTile } from "./outfit-item-tile";
import { OutfitPreview } from "./outfit-preview";
import type { OutfitEdit } from "./types";

/** A planned outfit inline in the event row: wardrobe-item tiles, the AURA
 *  rationale, amber gap chips for anything the wardrobe couldn't cover, the
 *  storage-free re-plan nudge, and — when editable — inline Regenerate / Swap
 *  actions (#178). Each tile carries its own hover Swap affordance; Regenerate
 *  redoes the whole pick. */
export function PlannedOutfitView({
  eventId,
  outfit,
  showReplanNudge,
  canEdit,
  editing,
  swapItemId,
  onReplan,
}: {
  eventId: string;
  outfit: PlannedOutfitDto;
  showReplanNudge: boolean;
  canEdit: boolean;
  editing: boolean;
  swapItemId: string | null;
  onReplan: (edit: OutfitEdit) => void;
}) {
  // A Regenerate is in flight when the outfit is editing but no specific tile is.
  const regenerating = editing && swapItemId === null;

  return (
    <div className="mt-3 space-y-2">
      {/* On-demand try-on preview — the portrait wearing this outfit — foregrounded
          as the hero. Only offered when there's a pick to render (an all-gaps
          outfit has nothing to try on). A Regenerate/Swap that changes the item
          set clears previewImageUrl server-side (#178), so the cache is keyed on
          the current item set. */}
      {outfit.items.length > 0 ? (
        <OutfitPreview
          key={outfit.previewImageUrl ?? "none"}
          eventId={eventId}
          cachedPreviewUrl={outfit.previewImageUrl}
        />
      ) : null}
      {showReplanNudge ? (
        <p className="text-brand-magenta flex items-start gap-1.5 text-xs font-medium">
          <CloudSun className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>There&apos;s a forecast for this day now — re-plan to factor in the weather.</span>
        </p>
      ) : null}
      {outfit.items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {outfit.items.map((item) => (
            <li key={item.id}>
              <OutfitItemTile
                item={item}
                canSwap={canEdit && outfit.items.length > 1}
                swapping={swapItemId === item.id}
                disabled={editing}
                onSwap={() => onReplan({ mode: "swap", itemId: item.id })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {outfit.rationale ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs text-pretty">
          <Shirt className="text-brand-magenta mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{outfit.rationale}</span>
        </p>
      ) : null}

      {outfit.gaps.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {outfit.gaps.map((gap, index) => (
            <li key={`${gap.slot}-${index}`}>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                title={gap.note}
              >
                <TriangleAlert className="size-3" aria-hidden="true" />
                {gap.slot}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        <div className="pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReplan({ mode: "regenerate" })}
            disabled={editing}
            className="text-muted-foreground hover:text-brand-magenta h-7 gap-1.5 rounded-full px-2.5 text-xs"
          >
            {regenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" />
                Regenerate
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
