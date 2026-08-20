"use client";

import * as React from "react";
import { Loader2, Replace } from "lucide-react";

import type { PlannedOutfitDto } from "@/lib/aura-outfit-planner";

/** One wardrobe-item tile in a planned outfit. It fetches its own short-lived,
 *  server-authorized media URL — the browser never receives a durable asset URL —
 *  exactly as the wardrobe gallery does. When the outfit is editable it carries a
 *  hover/focus Swap affordance that replaces just this piece (#178). */
export function OutfitItemTile({
  item,
  canSwap = false,
  swapping = false,
  disabled = false,
  onSwap,
}: {
  item: PlannedOutfitDto["items"][number];
  canSwap?: boolean;
  swapping?: boolean;
  disabled?: boolean;
  onSwap?: () => void;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    async function loadImage() {
      try {
        const response = await fetch(`/api/wardrobe/${item.id}/media?variant=normalized`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { url?: string } | null;
        if (!controller.signal.aborted && response.ok && body?.url) setImageUrl(body.url);
      } catch {
        // A missing tile image is non-fatal — the label still identifies the piece.
      }
    }
    void loadImage();
    return () => controller.abort();
  }, [item.id]);

  return (
    <div className="group/tile w-16" title={`${item.name} · ${item.color}`}>
      <div className="bg-muted relative aspect-square w-16 overflow-hidden rounded-lg border">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a durable asset
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : (
          <div className="size-full animate-pulse" aria-hidden="true" />
        )}
        {canSwap ? (
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled}
            aria-label={`Swap ${item.name}`}
            className="bg-brand-ink/55 focus-visible:ring-ring absolute inset-0 grid place-items-center text-white opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-0"
          >
            {swapping ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Replace className="size-4" />
            )}
          </button>
        ) : null}
        {swapping && !canSwap ? (
          <div className="bg-brand-ink/55 absolute inset-0 grid place-items-center text-white">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 truncate text-[10px]">{item.name}</p>
    </div>
  );
}
