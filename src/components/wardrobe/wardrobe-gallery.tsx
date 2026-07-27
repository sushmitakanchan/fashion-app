"use client";

import Image from "next/image";
import * as React from "react";
import { PlusIcon, XIcon } from "lucide-react";

import {
  getWardrobeItems,
  inferWardrobeCategory,
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

type PendingWardrobeItem = {
  name: string;
  imageUrl: string;
};

function nameFromFile(file: File): string {
  return file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readPhoto(file: File): Promise<PendingWardrobeItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image preview unavailable"));
        return;
      }
      resolve({ name: nameFromFile(file), imageUrl: reader.result });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

/**
 * The wardrobe's interactive island. New items live in this browser session,
 * so a newly added piece is immediately available in All and its category.
 */
export function WardrobeGallery() {
  const [category, setCategory] = React.useState<WardrobeCategory>("all");
  const [addedItems, setAddedItems] = React.useState<WardrobeItem[]>([]);
  const [isAdding, setIsAdding] = React.useState(false);
  const [pendingItems, setPendingItems] = React.useState<PendingWardrobeItem[]>([]);
  const [formError, setFormError] = React.useState("");
  const items = getWardrobeItems(category, addedItems);

  function resetForm() {
    setPendingItems([]);
    setFormError("");
  }

  function closeAddItem() {
    setIsAdding(false);
    resetForm();
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setFormError("");

    if (files.length === 0) {
      setPendingItems([]);
      return;
    }
    if (files.some((file) => !file.type.startsWith("image/"))) {
      setFormError("Choose image files for your wardrobe pieces.");
      return;
    }
    if (files.some((file) => file.size > 2 * 1024 * 1024)) {
      setFormError("Choose images smaller than 2 MB each for this preview.");
      return;
    }

    try {
      setPendingItems(await Promise.all(files.map(readPhoto)));
    } catch {
      setFormError("We couldn’t read one of those images. Please try again.");
    }
  }

  function handleAddItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pendingItems.length === 0) {
      setFormError("Choose at least one clothing photo to continue.");
      return;
    }

    setAddedItems((current) => [
      ...pendingItems.map((item) => {
        const itemCategory = inferWardrobeCategory(item.name);
        return {
          id: crypto.randomUUID(),
          name: item.name,
          category: itemCategory,
          note: `Added to ${categoryLabels[itemCategory]}`,
          imageUrl: item.imageUrl,
        };
      }),
      ...current,
    ]);
    setCategory("all");
    closeAddItem();
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
              Add your own pieces and keep every outfit-building block in one
              place.
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-heading text-3xl tracking-wide uppercase">
              {categoryHeadings[category]}
            </h2>
            <p className="text-muted-foreground text-sm">
              {items.length} {items.length === 1 ? "piece" : "pieces"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="bg-cta text-cta-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-bold tracking-wide uppercase hover:brightness-105 focus-visible:ring-3 focus-visible:outline-none"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            Add items
          </button>
        </div>
        {items.length === 0 ? (
          <EmptyWardrobe onAdd={() => setIsAdding(true)} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {items.map((item) => (
              <WardrobeCard
                key={item.id}
                item={item}
                onDelete={(id) =>
                  setAddedItems((current) =>
                    current.filter((addedItem) => addedItem.id !== id),
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
      {isAdding ? (
        <AddItemDialog
          items={pendingItems}
          error={formError}
          onClose={closeAddItem}
          onPhotoChange={handlePhotoChange}
          onSubmit={handleAddItem}
        />
      ) : null}
    </main>
  );
}

function WardrobeCard({
  item,
  onDelete,
}: {
  item: WardrobeItem;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="bg-card/95 text-foreground focus-visible:ring-ring absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full border shadow-sm transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:outline-none"
        aria-label={`Delete ${item.name}`}
      >
        <XIcon aria-hidden="true" className="size-3.5" />
      </button>
      {/* The photo is supplied by the visitor and stays in this local preview. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.name}
        className="aspect-[4/5] w-full object-cover"
      />
      <div className="p-3.5 sm:p-4">
        <h3 className="text-sm font-bold text-balance">{item.name}</h3>
        <p className="text-muted-foreground mt-1 text-xs">{item.note}</p>
      </div>
    </article>
  );
}

function EmptyWardrobe({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-border bg-card grid min-h-52 place-items-center rounded-2xl border border-dashed p-6 text-center">
      <div>
        <p className="font-heading text-2xl tracking-wide uppercase">
          Your wardrobe is ready
        </p>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm text-pretty">
          Add your first pieces and they will appear here and in their matching
          categories.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="text-brand-magenta focus-visible:ring-ring mt-4 text-xs font-bold tracking-wide uppercase underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none"
        >
          Add items
        </button>
      </div>
    </div>
  );
}

type AddItemDialogProps = {
  items: PendingWardrobeItem[];
  error: string;
  onClose: () => void;
  onPhotoChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function AddItemDialog({
  items,
  error,
  onClose,
  onPhotoChange,
  onSubmit,
}: AddItemDialogProps) {
  return (
    <div className="bg-brand-ink/35 fixed inset-0 z-50 grid place-items-end p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-title"
        className="bg-card text-card-foreground w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">
              Build your closet
            </p>
            <h2 id="add-item-title" className="font-heading mt-2 text-3xl tracking-wide uppercase">
              Add items
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-visible:ring-ring grid size-9 place-items-center rounded-full border hover:bg-accent focus-visible:ring-3 focus-visible:outline-none"
            aria-label="Close add item"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
        <form className="mt-6 grid gap-5" onSubmit={onSubmit}>
          <label className="grid gap-2 text-sm font-semibold">
            Clothing photos
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={onPhotoChange}
              className="border-input bg-background file:bg-accent file:text-foreground h-11 cursor-pointer rounded-xl border px-2 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-xs file:font-bold"
            />
          </label>
          {items.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {items.map((item) => (
                <figure key={item.imageUrl} className="overflow-hidden rounded-xl border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.name} className="aspect-square w-full object-cover" />
                  <figcaption className="truncate px-2 py-1.5 text-xs">{item.name}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <p className="text-muted-foreground text-xs leading-relaxed">
            Select one or more photos. AURA uses each file name to place it in
            a wardrobe category, so use clear names such as “linen-shirt”.
          </p>
          {error ? <p className="text-destructive text-sm" role="alert">{error}</p> : null}
          <button
            type="submit"
            className="bg-cta text-cta-foreground focus-visible:ring-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-xs font-bold tracking-wide uppercase hover:brightness-105 focus-visible:ring-3 focus-visible:outline-none"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            Add {items.length || "selected"} {items.length === 1 ? "item" : "items"}
            {items.length > 0 ? " to wardrobe" : ""}
          </button>
        </form>
      </section>
    </div>
  );
}
