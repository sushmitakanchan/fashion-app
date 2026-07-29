"use client";

import Image from "next/image";
import * as React from "react";

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
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};

const categoryHeadings: Record<WardrobeCategory, string> = {
  all: "All pieces",
  tops: "Tops",
  bottoms: "Bottoms",
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

  React.useEffect(() => {
    const controller = new AbortController();
    const query = category === "all" ? "" : `?category=${category}`;

    async function loadItems() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/wardrobe${query}`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as WardrobeResponse | null;
        if (!response.ok || !body?.items) {
          throw new Error(body?.error ?? "We couldn't load your wardrobe.");
        }
        if (!controller.signal.aborted) setItems(body.items);
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
  }, [category]);

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
            {items.map((item) => <WardrobeCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </main>
  );
}

function WardrobeCard({ item }: { item: WardrobeItem }) {
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
      </div>
    </article>
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
