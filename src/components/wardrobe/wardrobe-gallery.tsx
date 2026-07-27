"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";

import {
  getWardrobeItems,
  wardrobeCategories,
  type WardrobeCategory,
  type WardrobeItem,
} from "@/lib/wardrobe";
import { cn } from "@/lib/utils";

const categoryLabels: Record<WardrobeCategory, string> = {
  all: "All",
  tops: "Tops",
  bottoms: "Bottoms",
  bags: "Bags",
  accessories: "Accessories",
};

const categoryHeadings: Record<WardrobeCategory, string> = {
  all: "All pieces",
  tops: "Tops",
  bottoms: "Bottoms",
  bags: "Bags",
  accessories: "Accessories",
};

const toneClasses: Record<WardrobeItem["tone"], string> = {
  lime: "bg-brand-lime text-brand-lime-foreground",
  magenta: "bg-brand-magenta text-brand-magenta-foreground",
  ink: "bg-brand-ink text-brand-ink-foreground",
  paper: "bg-[#f5efe3] text-brand-ink dark:bg-card",
};

const HATCH = {
  backgroundImage:
    "repeating-linear-gradient(70deg, rgb(20 17 15 / 0.12) 0 2px, transparent 2px 12px)",
} as const;

/**
 * The wardrobe's interactive island. The full collection is intentionally
 * static, so changing a filter is instant and does not ask the server to
 * re-render a page that already has every item it needs.
 */
export function WardrobeGallery() {
  const [category, setCategory] = React.useState<WardrobeCategory>("all");
  const items = getWardrobeItems(category);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-6 sm:py-10">
      <section className="bg-brand-ink text-brand-ink-foreground relative overflow-hidden rounded-[2rem] px-6 py-8 sm:px-10 sm:py-11">
        <div aria-hidden="true" className="absolute inset-0 opacity-30" style={HATCH} />
        <div className="relative">
          <div>
            <p className="text-brand-lime text-xs font-bold tracking-[0.18em] uppercase">
              Your digital closet
            </p>
            <h1 className="font-heading mt-3 max-w-lg text-5xl leading-[0.9] tracking-wide uppercase sm:text-6xl">
              What&apos;s in your wardrobe?
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-pretty text-brand-ink-foreground/75">
              A clear view of the pieces you reach for, ready to mix into your
              next look.
            </p>
            <a
              href="#wardrobe-items"
              className="bg-brand-lime text-brand-lime-foreground focus-visible:ring-brand-lime mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold tracking-wide uppercase transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:outline-none"
            >
              <PlusIcon aria-hidden="true" className="size-3.5" />
              Explore pieces
            </a>
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
            {items.length} {items.length === 1 ? "piece" : "pieces"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {items.map((item) => (
            <WardrobeCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </main>
  );
}

function WardrobeCard({ item }: { item: WardrobeItem }) {
  return (
    <article className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <div
        aria-hidden="true"
        className={cn(
          "relative grid aspect-[4/5] place-items-center overflow-hidden",
          toneClasses[item.tone],
        )}
        style={HATCH}
      >
        <Garment illustration={item.illustration} />
      </div>
      <div className="p-3.5 sm:p-4">
        <h3 className="text-sm font-bold text-balance">{item.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{item.note}</p>
      </div>
    </article>
  );
}

function Garment({ illustration }: Pick<WardrobeItem, "illustration">) {
  const base = "bg-current shadow-[0_7px_0_rgb(20_17_15_/_0.13)]";

  if (illustration === "tank") {
    return <span className={cn(base, "h-28 w-20 rounded-t-[2.25rem] rounded-b-xl border-x-8 border-current/30")} />;
  }
  if (illustration === "tee") {
    return <span className={cn(base, "h-24 w-28 rounded-xl [clip-path:polygon(19%_0,37%_0,43%_10%,57%_10%,63%_0,81%_0,100%_28%,84%_40%,77%_28%,77%_100%,23%_100%,23%_28%,16%_40%,0_28%)]")} />;
  }
  if (illustration === "shirt") {
    return <span className={cn(base, "h-28 w-24 rounded-b-xl [clip-path:polygon(15%_0,36%_0,50%_13%,64%_0,85%_0,100%_28%,83%_36%,78%_25%,78%_100%,22%_100%,22%_25%,17%_36%,0_28%)]")} />;
  }
  if (illustration === "trousers" || illustration === "jeans") {
    return <span className={cn(base, "h-28 w-24 [clip-path:polygon(5%_0,95%_0,84%_100%,53%_100%,50%_46%,47%_100%,16%_100%)]")} />;
  }
  if (illustration === "skirt") {
    return <span className={cn(base, "h-28 w-28 [clip-path:polygon(23%_0,77%_0,100%_100%,0_100%)]")} />;
  }
  if (illustration === "bag" || illustration === "tote") {
    return <span className={cn(base, illustration === "bag" ? "h-20 w-28 rounded-2xl before:absolute before:-top-7 before:left-8 before:h-10 before:w-12 before:rounded-t-full before:border-[7px] before:border-current" : "h-24 w-24 rounded-b-2xl [clip-path:polygon(10%_0,90%_0,100%_100%,0_100%)]")} />;
  }
  if (illustration === "shoe") {
    return <span className={cn(base, "h-12 w-32 rounded-l-xl rounded-br-[2rem] [clip-path:polygon(20%_0,62%_0,76%_50%,100%_60%,100%_100%,0_100%,0_55%,17%_46%)]")} />;
  }
  if (illustration === "watch") {
    return <span className="relative size-20 rounded-full border-[10px] border-current bg-transparent before:absolute before:-top-16 before:left-4 before:h-10 before:w-6 before:rounded-t-lg before:bg-current after:absolute after:-bottom-16 after:left-4 after:h-10 after:w-6 after:rounded-b-lg after:bg-current" />;
  }
  if (illustration === "scarf") {
    return <span className={cn(base, "h-28 w-20 rounded-full [clip-path:polygon(20%_0,80%_0,100%_45%,70%_75%,82%_100%,50%_88%,18%_100%,30%_75%,0_45%)]")} />;
  }
  return <span className="relative h-11 w-28 rounded-full border-[7px] border-current bg-transparent before:absolute before:-left-8 before:top-1/2 before:size-8 before:-translate-y-1/2 before:rounded-full before:border-[7px] before:border-current after:absolute after:-right-8 after:top-1/2 after:size-8 after:-translate-y-1/2 after:rounded-full after:border-[7px] after:border-current" />;
}
