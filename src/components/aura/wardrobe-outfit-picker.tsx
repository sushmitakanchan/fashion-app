"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import { MANUAL_OUTFIT_MAX_ITEMS } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A wardrobe piece as the picker needs it — the live-wardrobe list shape. */
type PickerItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  brand: string | null;
};

type WardrobeResponse = { items?: PickerItem[]; error?: string };

/** One selectable wardrobe tile: it fetches its own short-lived, server-authorized
 *  media URL (the browser never receives a durable asset URL), exactly as the
 *  wardrobe gallery and the outfit tiles do. */
function PickerTile({
  item,
  selected,
  disabled,
  onToggle,
}: {
  item: PickerItem;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
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
    void load();
    return () => controller.abort();
  }, [item.id]);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !selected}
      aria-pressed={selected}
      title={`${item.name} · ${item.color}`}
      className={cn(
        "group/tile focus-visible:ring-ring relative flex flex-col overflow-hidden rounded-xl border text-left transition focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "border-brand-magenta ring-brand-magenta/40 ring-2"
          : "border-border hover:border-brand-magenta/50",
        disabled && !selected ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <div className="bg-muted relative aspect-square w-full overflow-hidden">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a durable asset
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : (
          <div className="size-full animate-pulse" aria-hidden="true" />
        )}
        {selected ? (
          <span className="bg-brand-magenta text-brand-magenta-foreground absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
        <span className="bg-background/80 text-muted-foreground absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium tracking-[0.12em] uppercase backdrop-blur-sm">
          {item.category}
        </span>
      </div>
      <span className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium">{item.name}</span>
        <span className="text-muted-foreground truncate text-[11px]">
          {item.brand ? `${item.color} · ${item.brand}` : item.color}
        </span>
      </span>
    </button>
  );
}

/**
 * Build or replace an event's outfit BY HAND. It sends the COMPLETE desired set of
 * wardrobe-item ids to the manual endpoint (`PUT /outfit`), which is a true
 * replace — so opening it pre-selected with the current pick means "replace one
 * slot" and "build the whole look" are the same gesture. It makes no external
 * call, so it is NOT behind the Smart Planning gate.
 *
 * At least one piece and at most {@link MANUAL_OUTFIT_MAX_ITEMS}: an empty save is
 * refused (never a silent un-plan), and the ceiling is enforced client-side by
 * disabling unselected tiles at the cap.
 */
export function WardrobeOutfitPicker({
  initialItemIds,
  saving,
  onCancel,
  onSave,
}: {
  initialItemIds: readonly string[];
  saving: boolean;
  onCancel: () => void;
  onSave: (itemIds: string[]) => void;
}) {
  const [items, setItems] = React.useState<PickerItem[] | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>(() => [...initialItemIds]);

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/wardrobe", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as WardrobeResponse | null;
        if (!response.ok || !body?.items) {
          throw new Error(body?.error ?? "We couldn't load your wardrobe.");
        }
        if (!controller.signal.aborted) setItems(body.items);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setLoadError(reason instanceof Error ? reason.message : "We couldn't load your wardrobe.");
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, saving]);

  const atCap = selected.length >= MANUAL_OUTFIT_MAX_ITEMS;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((candidate) => candidate !== id)
        : current.length >= MANUAL_OUTFIT_MAX_ITEMS
          ? current
          : [...current, id],
    );
  }

  return (
    <div
      className="bg-brand-ink/35 fixed inset-0 z-50 grid place-items-end p-3 backdrop-blur-sm sm:place-items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wardrobe-picker-title"
        className="bg-card text-card-foreground flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <h2
              id="wardrobe-picker-title"
              className="font-heading text-xl tracking-wide uppercase"
            >
              Build it yourself
            </h2>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">
              Pick the pieces for this look — up to {MANUAL_OUTFIT_MAX_ITEMS}. Saving replaces
              whatever the outfit holds now.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loadError ? (
            <p className="text-destructive py-8 text-center text-sm">{loadError}</p>
          ) : items === null ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading your wardrobe…
            </div>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm text-pretty">
              Your wardrobe is empty. Add some pieces first, then you can dress this event by
              hand.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {items.map((item) => (
                <PickerTile
                  key={item.id}
                  item={item}
                  selected={selected.includes(item.id)}
                  disabled={atCap}
                  onToggle={() => toggle(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
          <span className="text-muted-foreground text-sm tabular-nums">
            {selected.length} selected
            {atCap ? ` · max ${MANUAL_OUTFIT_MAX_ITEMS}` : ""}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => onSave(selected)}
              disabled={saving || selected.length === 0}
            >
              {saving ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save outfit"
              )}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
