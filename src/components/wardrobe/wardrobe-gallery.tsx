"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  wardrobeCategories,
  type WardrobeCategory,
  type WardrobeItemCategory,
} from "@/lib/wardrobe";
import { cn } from "@/lib/utils";

const categoryLabels: Record<WardrobeCategory, string> = {
  all: "All",
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  activewear: "Activewear",
  outerwear: "Outerwear",
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};

const categoryHeadings: Record<WardrobeCategory, string> = {
  all: "All pieces",
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  activewear: "Activewear",
  outerwear: "Outerwear",
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(70deg, rgb(20 17 15 / 0.12) 0 2px, transparent 2px 12px)",
} as const;

const savedDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatSavedDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : savedDateFormatter.format(date);
}

export type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeItemCategory;
  color: string;
  brand: string | null;
  occasion: string | null;
  normalizedMediaId: string;
  createdAt: string;
};

type WardrobeResponse = { items?: WardrobeItem[]; error?: string };
type MediaResponse = { url?: string };
type RecoverableItem = { id: string; name: string; recoveryExpiresAt: string };
type RecoverableResponse = { items?: RecoverableItem[]; error?: string };
type ItemResponse = { item?: WardrobeItem & { recoveryExpiresAt?: string | null }; error?: string };

/**
 * The persisted, owner-scoped wardrobe browser. Item metadata comes from the
 * active-item API; every image is separately resolved through the owner-only
 * media endpoint so the browser never receives a durable asset URL.
 */
export function WardrobeGallery() {
  const [category, setCategory] = React.useState<WardrobeCategory>("all");
  const [items, setItems] = React.useState<WardrobeItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [recoverable, setRecoverable] = React.useState<RecoverableItem[]>([]);
  const [editing, setEditing] = React.useState<WardrobeItem | null>(null);
  const [refresh, setRefresh] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const query = category === "all" ? "" : `?category=${category}`;

    async function loadItems() {
      setLoading(true);
      setError("");
      try {
        const [response, recoveryResponse] = await Promise.all([
          fetch(`/api/wardrobe${query}`, { signal: controller.signal }),
          fetch("/api/wardrobe/recoverable", { signal: controller.signal }),
        ]);
        const body = (await response.json().catch(() => null)) as WardrobeResponse | null;
        const recoveryBody = (await recoveryResponse.json().catch(() => null)) as RecoverableResponse | null;
        if (!response.ok || !body?.items) {
          throw new Error(body?.error ?? "We couldn't load your wardrobe.");
        }
        if (!controller.signal.aborted) {
          setItems(body.items);
          if (recoveryResponse.ok && recoveryBody?.items) setRecoverable(recoveryBody.items);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(
          reason instanceof Error ? reason.message : "We couldn't load your wardrobe.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadItems();
    return () => controller.abort();
  }, [category, refresh]);

  async function restore(item: RecoverableItem) {
    const response = await fetch(`/api/wardrobe/${item.id}/restore`, { method: "POST" });
    const body = (await response.json().catch(() => null)) as ItemResponse | null;
    if (!response.ok) {
      setError(body?.error ?? "We couldn't restore that item.");
      return;
    }
    setRecoverable((current) => current.filter((candidate) => candidate.id !== item.id));
    setRefresh((current) => current + 1);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-10">
      <section className="bg-card text-card-foreground relative min-h-80 overflow-hidden rounded-[2rem] border px-6 py-8 shadow-sm sm:px-10 sm:py-11 md:min-h-96">
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.08]" style={HATCH} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-70 dark:opacity-55 md:w-[72%] md:opacity-80 dark:md:opacity-100"
        >
          <Image
            src="/images/wardrobe-hero.png"
            alt=""
            fill
            priority
            sizes="(max-width: 767px) 100vw, 68vw"
            className="object-cover object-[62%_center] saturate-125 contrast-110"
          />
          <div className="bg-gradient-to-b from-card/80 via-brand-magenta/25 to-brand-magenta/10 dark:from-card/85 dark:via-card/35 dark:to-transparent absolute inset-0 md:bg-gradient-to-r md:from-card md:via-brand-magenta/20 md:to-brand-magenta/8 dark:md:via-card/25 dark:md:to-transparent" />
        </div>
        <div className="relative z-10 flex min-h-64 items-center md:min-h-80">
          <div>
            <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">
              Your digital closet
            </p>
            <h1 className="font-heading mt-3 max-w-lg text-5xl leading-[0.9] tracking-wide uppercase sm:text-6xl">
              What&apos;s in your wardrobe?
            </h1>
            <p className="mt-4 max-w-md text-left text-sm leading-relaxed font-medium text-black text-pretty dark:text-white">
              Your confirmed pieces stay private and are available wherever you
              sign in to AURA.
            </p>
            <Button render={<Link href="/wardrobe/import" />} className="mt-5">
              Import pieces
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Filter wardrobe by category">
        {wardrobeCategories.map((option) => {
          const selected = category === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(option)}
              className={cn(
                "focus-visible:ring-ring shrink-0 rounded-full border px-4 py-2 text-xs font-bold tracking-wide uppercase transition-colors focus-visible:ring-3 focus-visible:outline-none",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input bg-transparent hover:bg-accent",
              )}
            >
              {categoryLabels[option]}
            </button>
          );
        })}
      </div>

      <section id="wardrobe-items" className="scroll-mt-24 pt-8" aria-live="polite">
        <div className="mb-5 flex items-baseline gap-3">
          <h2 className="font-heading text-3xl tracking-wide uppercase">
            {categoryHeadings[category]}
          </h2>
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading…" : `${items.length} ${items.length === 1 ? "piece" : "pieces"}`}
          </p>
        </div>
        {error ? (
          <LoadError message={error} />
        ) : loading ? (
          <WardrobeLoading />
        ) : items.length === 0 ? (
          <EmptyWardrobe />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <WardrobeCard
                key={item.id}
                item={item}
                onDeleted={(deleted) => {
                  setItems((current) => current.filter((candidate) => candidate.id !== deleted.id));
                  const recoveryExpiresAt = deleted.recoveryExpiresAt;
                  if (recoveryExpiresAt) {
                    setRecoverable((current) => [
                      { id: deleted.id, name: deleted.name, recoveryExpiresAt },
                      ...current,
                    ]);
                  }
                }}
                onEdit={setEditing}
              />
            ))}
          </div>
        )}
      </section>

      {recoverable.length > 0 ? (
        <section className="mt-10 rounded-2xl border border-dashed p-5" aria-label="Recently deleted items">
          <h2 className="font-heading text-2xl tracking-wide uppercase">Recently deleted</h2>
          <p className="text-muted-foreground mt-1 text-sm">Restore a piece within 30 days without re-entering its details.</p>
          <ul className="mt-4 space-y-3">
            {recoverable.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{item.name}</span>
                <Button variant="outline" size="sm" onClick={() => void restore(item)}>Restore</Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {editing ? (
        <EditWardrobeItem
          item={editing}
          onCancel={() => setEditing(null)}
          onSaved={(updated) => {
            setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
            setEditing(null);
          }}
        />
      ) : null}
    </main>
  );
}

function WardrobeCard({ item, onDeleted, onEdit }: { item: WardrobeItem; onDeleted: (item: WardrobeItem & { recoveryExpiresAt?: string | null }) => void; onEdit: (item: WardrobeItem) => void }) {
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
  }, [item.id, item.normalizedMediaId]);

  async function remove() {
    const response = await fetch(`/api/wardrobe/${item.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as ItemResponse | null;
    if (response.ok && body?.item) onDeleted(body.item);
  }

  return (
    <WardrobeCardView
      item={item}
      imageUrl={imageUrl}
      onEdit={() => onEdit(item)}
      onDelete={() => void remove()}
    />
  );
}

/**
 * The presentational wardrobe tile, separated from data-fetching so it can be
 * rendered from a mock harness. `imageUrl` is a short-lived, server-authorized
 * URL (or null while it resolves).
 */
export function WardrobeCardView({
  item,
  imageUrl,
  onEdit,
  onDelete,
}: {
  item: WardrobeItem;
  imageUrl: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const chips = [item.color, categoryLabels[item.category], item.occasion].filter(
    (chip): chip is string => Boolean(chip),
  );

  return (
    <article className="border-brand-magenta/15 flex flex-col overflow-hidden rounded-[1.75rem] border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="bg-muted relative aspect-[4/5] overflow-hidden rounded-[1.35rem]">
        {imageUrl ? (
          // The URL was freshly authorized by the server and expires quickly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
          className="bg-brand-ink/85 text-brand-ink-foreground hover:bg-brand-ink focus-visible:ring-ring absolute right-3 top-3 grid size-8 place-items-center rounded-full backdrop-blur-sm transition-colors focus-visible:ring-3 focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-4">
        {formatSavedDate(item.createdAt) ? (
          <p className="text-muted-foreground text-xs">Saved {formatSavedDate(item.createdAt)}</p>
        ) : null}
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg leading-tight tracking-wide uppercase text-balance">{item.name}</h3>
            {item.brand ? (
              <p className="text-muted-foreground mt-1 truncate text-sm">{item.brand}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="bg-accent text-accent-foreground focus-visible:ring-ring inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold tracking-wide uppercase transition-[filter] hover:brightness-95 focus-visible:ring-3 focus-visible:outline-none"
          >
            Edit
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip, index) => (
            <span
              key={`${chip}-${index}`}
              className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

export function EditWardrobeItem({ item, onCancel, onSaved }: { item: WardrobeItem; onCancel: () => void; onSaved: (item: WardrobeItem) => void }) {
  const [category, setCategory] = React.useState<WardrobeItemCategory>(item.category);
  const [name, setName] = React.useState(item.name);
  const [color, setColor] = React.useState(item.color);
  const [brand, setBrand] = React.useState(item.brand ?? "");
  const [occasion, setOccasion] = React.useState(item.occasion ?? "");
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/wardrobe/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name, color, brand, occasion }),
    });
    const body = (await response.json().catch(() => null)) as ItemResponse | null;
    if (!response.ok || !body?.item) {
      setError(body?.error ?? "We couldn't save those changes.");
      return;
    }
    onSaved({ ...item, ...body.item });
  }

  // Taller, rounded field styling with a pink focus, shared by the inputs and
  // the category select. Surface colours come from the theme tokens so the popup
  // reads correctly in both light and dark mode.
  const fieldClass =
    "focus-visible:border-brand-magenta focus-visible:ring-brand-magenta/30 h-11 rounded-xl px-4";
  const selectClass = cn(
    fieldClass,
    "border-input bg-transparent dark:bg-input/30 border focus-visible:ring-3 focus-visible:outline-none",
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${item.name}`}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-brand-ink/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="bg-card text-card-foreground my-auto w-full max-w-xl rounded-3xl border p-6 shadow-2xl sm:p-8">
        <h2 className="font-heading text-brand-magenta text-2xl tracking-wide uppercase sm:text-3xl">Edit {item.name}</h2>
        <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
          <label className="grid gap-2 text-sm font-medium">Name<Input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="grid gap-2 text-sm font-medium">Colour<Input className={fieldClass} value={color} onChange={(event) => setColor(event.target.value)} required /></label>
          <label className="grid gap-2 text-sm font-medium">Brand <span className="text-muted-foreground font-normal">(optional)</span><Input className={fieldClass} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-medium">Category
            <select value={category} onChange={(event) => setCategory(event.target.value as WardrobeItemCategory)} className={selectClass}>
              {wardrobeCategories.filter((option): option is WardrobeItemCategory => option !== "all").map((option) => <option key={option} value={option}>{categoryLabels[option]}</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium sm:col-span-2">Occasion <span className="text-muted-foreground font-normal">(optional)</span><Input className={fieldClass} value={occasion} placeholder="e.g. casual, office, dinner date" onChange={(event) => setOccasion(event.target.value)} /></label>
          {error ? <p className="text-destructive text-sm sm:col-span-2">{error}</p> : null}
          <div className="mt-1 flex gap-3 sm:col-span-2">
            <Button type="submit" className="bg-brand-magenta text-brand-magenta-foreground rounded-full px-6 hover:brightness-105">Save changes</Button>
            <Button type="button" variant="outline" onClick={onCancel} className="rounded-full px-6">Cancel</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WardrobeLoading() {
  return <div className="bg-muted min-h-52 animate-pulse rounded-2xl" aria-label="Loading wardrobe" />;
}

function EmptyWardrobe() {
  return (
    <div className="border-border bg-card grid min-h-52 place-items-center rounded-2xl border border-dashed p-6 text-center">
      <div>
        <p className="font-heading text-2xl tracking-wide uppercase">Your wardrobe is ready</p>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm text-pretty">
          Saved pieces will appear here and in their matching categories.
        </p>
        <Link
          href="/wardrobe/import"
          className="text-brand-magenta focus-visible:ring-ring mt-4 inline-block text-xs font-bold tracking-wide uppercase underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
        >
          Add items
        </Link>
      </div>
    </div>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="border-destructive/40 bg-destructive/5 min-h-52 rounded-2xl border p-6 text-center">
      <p className="font-semibold">We couldn&apos;t load your wardrobe</p>
      <p className="text-muted-foreground mt-2 text-sm">{message}</p>
    </div>
  );
}
