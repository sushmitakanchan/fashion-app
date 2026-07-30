"use client";

import Image from "next/image";
import Link from "next/link";
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

type WardrobeItem = {
  id: string;
  name: string;
  category: WardrobeItemCategory;
  color: string;
  brand: string | null;
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
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
    <article className="overflow-hidden rounded-2xl border bg-card">
      <div className="bg-muted aspect-[4/5]">
        {imageUrl ? (
          // The URL was freshly authorized by the server and expires quickly.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : null}
      </div>
      <div className="p-3.5 sm:p-4">
        <h3 className="text-sm font-bold text-balance">{item.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {item.color}{item.brand ? ` · ${item.brand}` : ""}
        </p>
        <div className="mt-3 flex gap-3 text-xs font-bold uppercase">
          <button type="button" onClick={() => onEdit(item)} className="text-brand-magenta underline underline-offset-4">Edit</button>
          <button type="button" onClick={() => void remove()} className="text-destructive underline underline-offset-4">Delete</button>
        </div>
      </div>
    </article>
  );
}

function EditWardrobeItem({ item, onCancel, onSaved }: { item: WardrobeItem; onCancel: () => void; onSaved: (item: WardrobeItem) => void }) {
  const [category, setCategory] = React.useState<WardrobeItemCategory>(item.category);
  const [name, setName] = React.useState(item.name);
  const [color, setColor] = React.useState(item.color);
  const [brand, setBrand] = React.useState(item.brand ?? "");
  const [error, setError] = React.useState("");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/wardrobe/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name, color, brand }),
    });
    const body = (await response.json().catch(() => null)) as ItemResponse | null;
    if (!response.ok || !body?.item) {
      setError(body?.error ?? "We couldn't save those changes.");
      return;
    }
    onSaved({ ...item, ...body.item });
  }

  return (
    <section className="mt-10 rounded-2xl border bg-card p-5" aria-label={`Edit ${item.name}`}>
      <h2 className="font-heading text-2xl tracking-wide uppercase">Edit {item.name}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void save(event)}>
        <label className="grid gap-1.5 text-sm font-medium">Name<Input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">Colour<Input value={color} onChange={(event) => setColor(event.target.value)} required /></label>
        <label className="grid gap-1.5 text-sm font-medium">Brand <span className="text-muted-foreground font-normal">(optional)</span><Input value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Category
          <select value={category} onChange={(event) => setCategory(event.target.value as WardrobeItemCategory)} className="border-input bg-background h-9 rounded-md border px-3 text-sm">
            {wardrobeCategories.filter((option): option is WardrobeItemCategory => option !== "all").map((option) => <option key={option} value={option}>{categoryLabels[option]}</option>)}
          </select>
        </label>
        {error ? <p className="text-destructive text-sm sm:col-span-2">{error}</p> : null}
        <div className="flex gap-3 sm:col-span-2"><Button type="submit">Save changes</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
      </form>
    </section>
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
