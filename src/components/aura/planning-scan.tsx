"use client";

import * as React from "react";
import { Check, Shirt } from "lucide-react";

import {
  CAPTION_INTERVAL_MS,
  PLAN_CAPTIONS,
  usePrefersReducedMotion,
} from "@/components/aura/aura-portrait-loading";

const TILE_COUNT = 8;
// Grid positions that "get picked" mid-loop — a lime check settles in, reading as
// AURA choosing a couple of pieces. Purely decorative.
const PICKED = new Set([0, 5]);

type WardrobeListResponse = { items?: { id: string }[] };

/** One tile in the planning scan: a wardrobe piece being read. It fetches its own
 *  short-lived signed media URL like the garment tiles do, and falls back to a
 *  shirt glyph until (or unless) the image loads. The scan wave and the pick
 *  check are decorative CSS, staggered by `index`. */
function ScanTile({
  itemId,
  index,
  picked,
}: {
  itemId: string | null;
  index: number;
  picked: boolean;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!itemId) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/wardrobe/${itemId}/media?variant=normalized`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { url?: string } | null;
        if (!controller.signal.aborted && response.ok && body?.url) setImageUrl(body.url);
      } catch {
        // Non-fatal — the glyph placeholder carries the motion on its own.
      }
    }
    void load();
    return () => controller.abort();
  }, [itemId]);

  return (
    <div
      className="ps-tile border-border bg-brand-ink/40 relative grid aspect-[3/4] place-items-center overflow-hidden rounded-lg border"
      style={{ animationDelay: `${index * 0.35}s` }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a durable asset
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <Shirt className="text-brand-ink-foreground/40 size-5" aria-hidden="true" />
      )}
      {picked ? (
        <span
          className="ps-check bg-brand-lime text-brand-lime-foreground absolute top-1 right-1 grid size-4 place-items-center rounded-full"
          style={{ animationDelay: `${index * 0.35 + 0.7}s` }}
        >
          <Check className="size-2.5" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The planning-in-progress loader for the Rack. Reads as AURA going through your
 * wardrobe — an attention wave over your real wardrobe thumbnails, a lens sweeping
 * down, a couple of pieces settling with a check — while the single (non-streaming)
 * planner call runs. The motion is decorative and looped, NOT the AI's real pick
 * order; the reveal is the outfit appearing on the Rack, never a timer. It mirrors
 * the darkroom loader's ink ground, ambient blooms, looping caption, and
 * indeterminate bar, and freezes under reduced-motion.
 */
export function PlanningScan() {
  const [itemIds, setItemIds] = React.useState<string[]>([]);
  const reduceMotion = usePrefersReducedMotion();
  const [caption, setCaption] = React.useState(0);

  // Pull a handful of real wardrobe pieces to scan. An empty or unreadable
  // wardrobe just leaves glyph tiles — the motion stands on its own.
  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/wardrobe", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as WardrobeListResponse | null;
        if (!controller.signal.aborted && response.ok && Array.isArray(body?.items)) {
          setItemIds(body.items.slice(0, TILE_COUNT).map((item) => item.id));
        }
      } catch {
        // Ignore — glyph tiles carry the animation.
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(
      () => setCaption((current) => (current + 1) % PLAN_CAPTIONS.length),
      CAPTION_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  const tiles = Array.from({ length: TILE_COUNT }, (_, index) => itemIds[index] ?? null);

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-brand-ink text-brand-ink-foreground relative grid min-h-[22rem] grid-rows-[auto_1fr_auto] gap-4 overflow-hidden rounded-xl p-6"
    >
      <p className="sr-only">Planning your outfit. This usually takes up to a minute.</p>

      {/* Ambient brand blooms — the shared darkroom language. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-[-25%] z-0">
        <span
          className="pl-bloom"
          style={{
            width: "58%",
            height: "46%",
            left: "4%",
            top: "8%",
            background: "radial-gradient(circle, var(--brand-lime), transparent 66%)",
            animation: "pl-drift-a 13s ease-in-out infinite",
          }}
        />
        <span
          className="pl-bloom"
          style={{
            width: "54%",
            height: "44%",
            right: "2%",
            bottom: "6%",
            background: "radial-gradient(circle, var(--brand-magenta), transparent 66%)",
            animation: "pl-drift-b 17s ease-in-out infinite",
          }}
        />
      </div>

      {/* The lens sweeping down the closet. */}
      {!reduceMotion ? (
        <span
          className="ps-scanline pointer-events-none absolute inset-x-0 z-[2]"
          style={{ height: "34%" }}
          aria-hidden="true"
        />
      ) : null}

      <p className="relative z-10 text-center text-sm font-medium">Planning your outfit</p>

      {/* The closet being read. */}
      <div className="relative z-10 self-center">
        <div className="mx-auto grid w-full max-w-[15rem] grid-cols-4 gap-2">
          {tiles.map((itemId, index) => (
            <ScanTile
              key={itemId ?? `slot-${index}`}
              itemId={itemId}
              index={index}
              picked={PICKED.has(index)}
            />
          ))}
        </div>
      </div>

      {/* Caption + indeterminate bar. */}
      <div className="relative z-10 grid justify-items-center gap-3 text-center">
        <p key={caption} className="pl-caption max-w-[16rem] font-serif text-lg text-balance italic">
          {PLAN_CAPTIONS[caption]}
        </p>
        <span
          className="pl-indicator relative h-0.5 w-32 overflow-hidden rounded-full"
          style={{ background: "rgba(245,239,227,.14)" }}
        />
      </div>
    </div>
  );
}
