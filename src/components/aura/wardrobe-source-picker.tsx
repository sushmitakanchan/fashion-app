"use client";

import * as React from "react";
import NextLink from "next/link";
import { CheckIcon, Loader2Icon } from "lucide-react";

import type { WardrobeSource } from "@/lib/aura-provenance";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The active-wardrobe fields the picker needs; the try-on source it produces
 * carries only the id, name, and a freshly signed thumbnail URL. */
type PickerItem = {
  id: string;
  name: string;
  color: string;
  brand: string | null;
};

type WardrobeResponse = { items?: PickerItem[]; error?: string };
type MediaResponse = { url?: string };

/**
 * Selects sources from the participant's own private wardrobe for AURA Try On.
 * It lists active items from the owner-scoped wardrobe API and, per item,
 * resolves a short-lived signed thumbnail through the owner-only media endpoint —
 * so the picker, like the wardrobe browser, never receives a durable asset URL.
 * Clicking an item hands the try-on surface a {@link WardrobeSource}; the server
 * re-authorizes the id at generation time, so the picker only has to keep the UI
 * honest about the shared source cap and what is already attached.
 */
export function WardrobeSourcePicker({
  attachedIds,
  canAddMore,
  disabled,
  onAdd,
}: {
  attachedIds: Set<string>;
  canAddMore: boolean;
  disabled: boolean;
  onAdd: (source: WardrobeSource) => void;
}) {
  const [items, setItems] = React.useState<PickerItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/wardrobe", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as WardrobeResponse | null;
        if (!response.ok || !body?.items) {
          throw new Error(body?.error ?? "We couldn't load your wardrobe.");
        }
        if (!controller.signal.aborted) setItems(body.items);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "We couldn't load your wardrobe.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <p
        className="text-muted-foreground flex items-center gap-2 py-6 text-sm"
        role="status"
      >
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        Loading your wardrobe…
      </p>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="border-destructive/40 bg-destructive/5 text-muted-foreground rounded-lg border p-4 text-sm"
      >
        {error}
      </p>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="border-border grid gap-2 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm font-medium">Your wardrobe is empty</p>
        <p className="text-muted-foreground text-xs text-pretty">
          Confirmed pieces you save appear here, ready to try on.
        </p>
        <Button
          variant="link"
          nativeButton={false}
          render={<NextLink href="/wardrobe" />}
          className="h-auto justify-self-center p-0 text-xs"
        >
          Go to your wardrobe
        </Button>
      </div>
    );
  }

  return (
    <div
      className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
      role="listbox"
      aria-label="Your wardrobe items"
    >
      {items.map((item) => {
        const attached = attachedIds.has(item.id);
        return (
          <PickerTile
            key={item.id}
            item={item}
            attached={attached}
            // An unattached item can only be added while there is room and no
            // generation is running; an attached one is always shown, marked.
            disabled={disabled || (!attached && !canAddMore)}
            onAdd={onAdd}
          />
        );
      })}
    </div>
  );
}

function PickerTile({
  item,
  attached,
  disabled,
  onAdd,
}: {
  item: PickerItem;
  attached: boolean;
  disabled: boolean;
  onAdd: (source: WardrobeSource) => void;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    async function loadImage() {
      const response = await fetch(
        `/api/wardrobe/${item.id}/media?variant=normalized`,
        { signal: controller.signal },
      );
      const body = (await response.json().catch(() => null)) as MediaResponse | null;
      if (!controller.signal.aborted && response.ok && body?.url) setImageUrl(body.url);
    }
    void loadImage();
    return () => controller.abort();
  }, [item.id]);

  // A tile can be added once its thumbnail has resolved: the same signed URL
  // becomes the source's preview and, if the look is saved, its re-encoded image.
  const canAdd = !attached && !disabled && Boolean(imageUrl);

  return (
    <button
      type="button"
      role="option"
      aria-selected={attached}
      disabled={!canAdd}
      onClick={() => {
        if (!imageUrl) return;
        onAdd({
          kind: "wardrobe",
          id: item.id,
          wardrobeItemId: item.id,
          name: item.name,
          previewUrl: imageUrl,
        });
      }}
      className={cn(
        "group border-border relative grid gap-1 rounded-lg border p-1 text-left transition-colors",
        canAdd ? "hover:bg-muted" : "cursor-default",
        attached && "border-primary",
      )}
      title={attached ? `${item.name} — already added` : `Add ${item.name}`}
    >
      <div className="bg-muted aspect-square overflow-hidden rounded-md">
        {imageUrl ? (
          // Freshly authorized, short-lived URL — never a durable asset URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={item.name}
            className={cn(
              "size-full object-cover",
              (attached || disabled) && "opacity-60",
            )}
          />
        ) : null}
      </div>
      <span className="truncate px-0.5 text-[11px] font-medium">{item.name}</span>
      {attached && (
        <span
          className="bg-primary text-primary-foreground absolute top-2 right-2 grid size-5 place-items-center rounded-full"
          aria-hidden
        >
          <CheckIcon className="size-3" />
        </span>
      )}
    </button>
  );
}
