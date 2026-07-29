"use client";

import * as React from "react";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleCheckIcon,
  FlaskConicalIcon,
  ImageOffIcon,
  PencilIcon,
  SaveIcon,
  WandSparklesIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

type Variant = "grid" | "focus" | "board" | "triage" | "checklist";
type Status = "ready" | "needs-review" | "failed";
type Item = {
  id: string;
  name: string;
  category: string;
  colour: string;
  brand: string;
  status: Status;
  tone: string;
};

const VARIANTS: { key: Variant; label: string }[] = [
  { key: "grid", label: "A — Bulk grid" },
  { key: "focus", label: "B — Focused review + health" },
  { key: "board", label: "C — Category board" },
  { key: "triage", label: "D — Confidence triage" },
  { key: "checklist", label: "E — Batch checklist" },
];

const INITIAL_ITEMS: Item[] = [
  { id: "1", name: "Black blazer", category: "Outerwear", colour: "Black", brand: "Armani", status: "ready", tone: "bg-stone-900" },
  { id: "2", name: "Cream knit", category: "Tops", colour: "Cream", brand: "", status: "needs-review", tone: "bg-amber-100" },
  { id: "3", name: "Wide-leg denim", category: "Bottoms", colour: "Indigo", brand: "Levi's", status: "ready", tone: "bg-blue-800" },
  { id: "4", name: "Leather tote", category: "Bags", colour: "Brown", brand: "", status: "needs-review", tone: "bg-amber-800" },
  { id: "5", name: "White trainers", category: "Shoes", colour: "White", brand: "Nike", status: "ready", tone: "bg-zinc-100" },
  { id: "6", name: "IMG_2041", category: "", colour: "", brand: "", status: "failed", tone: "bg-zinc-300" },
];

function readVariant(value: string | undefined): Variant {
  return VARIANTS.some(({ key }) => key === value) ? (value as Variant) : "grid";
}

function statusLabel(status: Status) {
  return status === "ready" ? "Ready" : status === "needs-review" ? "Review" : "Failed";
}

function ItemPhoto({ item, selected, onClick }: { item: Item; selected?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative aspect-[4/5] overflow-hidden rounded-xl border text-left shadow-sm transition focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
        item.status === "failed" ? "border-dashed bg-muted" : "border-border",
        selected && "ring-3 ring-brand-magenta ring-offset-2",
      )}
    >
      {item.status === "failed" ? (
        <span className="grid h-full place-items-center text-muted-foreground"><ImageOffIcon className="size-7" /></span>
      ) : (
        <span className={cn("absolute inset-0", item.tone)} />
      )}
      <span className="absolute inset-x-2 bottom-2 rounded-md bg-background/90 px-2 py-1 text-[10px] font-bold tracking-wide uppercase text-foreground backdrop-blur">
        {statusLabel(item.status)}
      </span>
    </button>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none" />
    </label>
  );
}

function ReviewBadge({ item }: { item: Item }) {
  return item.status === "failed" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangleIcon className="size-3.5" /> Upload failed</span> : item.status === "needs-review" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"><WandSparklesIcon className="size-3.5" /> Suggested — confirm</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><CircleCheckIcon className="size-3.5" /> Confirmed</span>;
}

export function WardrobeReviewPrototype({ requestedVariant }: { requestedVariant?: string }) {
  const [items, setItems] = React.useState(INITIAL_ITEMS);
  const [selected, setSelected] = React.useState<string[]>(["2", "4"]);
  const [activeId, setActiveId] = React.useState("2");
  const [saved, setSaved] = React.useState(false);
  const variant = readVariant(requestedVariant);
  const ready = items.filter((item) => item.status === "ready").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const active = items.find((item) => item.id === activeId) ?? items[0];

  const update = (id: string, changes: Partial<Item>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...changes, status: item.status === "failed" ? "failed" : "ready" } : item));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  const applyBulk = () => setItems((current) => current.map((item) => selected.includes(item.id) && item.status !== "failed" ? { ...item, category: "Tops", colour: "Black", status: "ready" } : item));

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <p className="mb-5 rounded-xl border border-dashed border-foreground/30 bg-card px-4 py-3 text-sm text-muted-foreground">Development prototype — this batch, its edits, and Save all are in-memory only.</p>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">AURA wardrobe</p>
          <h1 className="font-heading mt-2 text-4xl tracking-wide uppercase sm:text-5xl">Review 6 imported pieces</h1>
          <p className="mt-2 text-sm text-muted-foreground">{ready} ready to save · {failed} upload needs attention</p>
        </div>
        <button type="button" onClick={() => setSaved(true)} disabled={failed > 0} className="inline-flex h-11 items-center gap-2 rounded-full bg-cta px-5 text-xs font-bold tracking-wide uppercase text-cta-foreground disabled:cursor-not-allowed disabled:opacity-45"><SaveIcon className="size-4" /> {saved ? "Batch saved" : "Save all"}</button>
      </header>

      {variant === "grid" ? <BulkGrid items={items} selected={selected} toggle={toggle} applyBulk={applyBulk} /> : null}
      {variant === "focus" ? <FocusQueue items={items} active={active} setActiveId={setActiveId} update={update} /> : null}
      {variant === "board" ? <CategoryBoard items={items} selected={selected} toggle={toggle} update={update} /> : null}
      {variant === "triage" ? <ConfidenceTriage items={items} update={update} /> : null}
      {variant === "checklist" ? <BatchChecklist items={items} update={update} /> : null}
      <PrototypeSwitcher current={variant} />
    </main>
  );
}

function BulkGrid({ items, selected, toggle, applyBulk }: { items: Item[]; selected: string[]; toggle: (id: string) => void; applyBulk: () => void }) {
  return <div className="grid gap-6 lg:grid-cols-[1fr_18rem]"><section className="overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-heading text-2xl uppercase">Every item at once</h2><p className="text-xs text-muted-foreground">Select cards to edit a group.</p></div><span className="text-xs font-bold">{selected.length} selected</span></div><div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">{items.map((item) => <article key={item.id} className="min-w-0"><ItemPhoto item={item} selected={selected.includes(item.id)} onClick={() => toggle(item.id)} /><p className="mt-2 truncate text-sm font-bold">{item.name}</p><ReviewBadge item={item} /></article>)}</div></section><aside className="h-fit rounded-2xl border bg-card p-5"><p className="text-xs font-bold tracking-[0.16em] uppercase text-muted-foreground">Bulk edit {selected.length} pieces</p><div className="mt-5 space-y-4"><Field label="Category" value="Tops" onChange={() => undefined} /><Field label="Colour" value="Black" onChange={() => undefined} /><button type="button" onClick={applyBulk} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-bold uppercase text-primary-foreground"><CheckIcon className="size-4" /> Apply to selected</button></div><p className="mt-5 border-t pt-4 text-xs leading-relaxed text-muted-foreground">Failed uploads stay out of the batch until retried; suggestions remain editable on every card.</p></aside></div>;
}

function FocusQueue({ items, active, setActiveId, update }: { items: Item[]; active: Item; setActiveId: (id: string) => void; update: (id: string, changes: Partial<Item>) => void }) {
  const index = items.findIndex((item) => item.id === active.id);
  const adjacent = (direction: number) => setActiveId(items[(index + direction + items.length) % items.length].id);
  const confirmed = items.filter((item) => item.status === "ready").length;
  const needsReview = items.filter((item) => item.status === "needs-review").length;
  const failed = items.filter((item) => item.status === "failed").length;
  return <section className="mx-auto max-w-5xl"><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-4"><p className="text-xs font-bold tracking-[0.14em] uppercase text-muted-foreground">High confidence</p><p className="font-heading mt-1 text-2xl uppercase">{confirmed} ready</p><p className="mt-1 text-xs text-muted-foreground">Already clear enough to save.</p></div><div className="rounded-xl border border-amber-500/45 bg-amber-500/5 p-4"><p className="text-xs font-bold tracking-[0.14em] uppercase text-muted-foreground">Your attention</p><p className="font-heading mt-1 text-2xl uppercase">{needsReview} calls</p><p className="mt-1 text-xs text-muted-foreground">You confirm only uncertain suggestions.</p></div><div className="rounded-xl border border-destructive/35 bg-destructive/5 p-4"><p className="text-xs font-bold tracking-[0.14em] uppercase text-muted-foreground">Import health</p><p className="font-heading mt-1 text-2xl uppercase">{failed} retry</p><p className="mt-1 text-xs text-muted-foreground">Failed photos stay separate from review.</p></div></div><div className="rounded-2xl border bg-card p-5 sm:p-7"><div className="grid gap-7 sm:grid-cols-[minmax(12rem,20rem)_1fr]"><ItemPhoto item={active} /><div><ReviewBadge item={active} /><h2 className="font-heading mt-3 text-3xl uppercase">{active.name}</h2><p className="mt-2 text-sm text-muted-foreground">AI filled these fields from the photo. Correct anything before moving on.</p><div className="mt-6 grid gap-4"><Field label="Category" value={active.category} placeholder="Choose category" onChange={(category) => update(active.id, { category })} /><Field label="Colour" value={active.colour} placeholder="Add colour" onChange={(colour) => update(active.id, { colour })} /><Field label="Brand (optional)" value={active.brand} placeholder="Leave blank if unknown" onChange={(brand) => update(active.id, { brand })} /></div></div></div><div className="mt-7 flex items-center justify-between border-t pt-5"><button type="button" onClick={() => adjacent(-1)} className="inline-flex items-center gap-1 text-sm font-bold"><ArrowLeftIcon className="size-4" /> Previous</button><span className="text-xs text-muted-foreground">Review {index + 1} of {items.length}</span><button type="button" onClick={() => adjacent(1)} className="inline-flex items-center gap-1 text-sm font-bold">Next <ArrowRightIcon className="size-4" /></button></div></div></section>;
}

function CategoryBoard({ items, selected, toggle, update }: { items: Item[]; selected: string[]; toggle: (id: string) => void; update: (id: string, changes: Partial<Item>) => void }) {
  const columns = ["Needs review", "Ready to save", "Upload problem"];
  const matches = (item: Item, column: string) => column === "Needs review" ? item.status === "needs-review" : column === "Ready to save" ? item.status === "ready" : item.status === "failed";
  return <section className="overflow-x-auto"><div className="grid min-w-[54rem] grid-cols-3 gap-4">{columns.map((column) => <div key={column} className="rounded-2xl border bg-card/70 p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-heading text-xl uppercase">{column}</h2><span className="rounded-full bg-muted px-2 py-1 text-xs">{items.filter((item) => matches(item, column)).length}</span></div><div className="space-y-3">{items.filter((item) => matches(item, column)).map((item) => <article key={item.id} className={cn("rounded-xl border bg-background p-3", selected.includes(item.id) && "border-brand-magenta")}><div className="flex gap-3"><ItemPhoto item={item} selected={selected.includes(item.id)} onClick={() => toggle(item.id)} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><ReviewBadge item={item} /><button type="button" onClick={() => update(item.id, { category: item.category || "Accessories", colour: item.colour || "Black" })} className="mt-3 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-4"><PencilIcon className="size-3" /> Confirm</button></div></div></article>)}</div></div>)}</div></section>;
}

function ConfidenceTriage({ items, update }: { items: Item[]; update: (id: string, changes: Partial<Item>) => void }) {
  const certain = items.filter((item) => item.status === "ready");
  const uncertain = items.filter((item) => item.status === "needs-review");
  const failed = items.filter((item) => item.status === "failed");
  return <section className="grid gap-5 lg:grid-cols-[1fr_1fr_18rem]"><TriageLane title="High confidence" detail="These can be saved without a decision." items={certain} tone="border-emerald-500/45" update={update} /><TriageLane title="Your attention" detail="Only ambiguous suggestions surface here." items={uncertain} tone="border-amber-500/60" update={update} /><aside className="rounded-2xl border bg-card p-5"><p className="text-xs font-bold tracking-[0.16em] uppercase text-muted-foreground">Import health</p><p className="font-heading mt-3 text-4xl uppercase">{uncertain.length} calls</p><p className="mt-2 text-sm text-muted-foreground">The review starts with uncertainty, not every photo.</p><div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="font-bold">{failed.length} file needs retry</p><p className="mt-1 text-xs text-muted-foreground">Keep it separate from classification work.</p><button type="button" className="mt-3 text-xs font-bold underline underline-offset-4">Retry upload</button></div></aside></section>;
}

function TriageLane({ title, detail, items, tone, update }: { title: string; detail: string; items: Item[]; tone: string; update: (id: string, changes: Partial<Item>) => void }) {
  return <div className={cn("rounded-2xl border bg-card p-5", tone)}><h2 className="font-heading text-2xl uppercase">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{detail}</p><div className="mt-5 space-y-3">{items.map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl border bg-background p-3"><span className={cn("size-12 shrink-0 rounded-lg", item.tone)} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><p className="truncate text-xs text-muted-foreground">{item.category || "No category"} · {item.colour || "No colour"} · {item.brand || "Brand unknown"}</p></div>{item.status === "needs-review" ? <button type="button" onClick={() => update(item.id, { category: item.category || "Tops", colour: item.colour || "Cream" })} className="rounded-full border px-3 py-1.5 text-xs font-bold">Confirm</button> : <CircleCheckIcon className="size-5 text-emerald-600" />}</article>)}</div></div>;
}

function BatchChecklist({ items, update }: { items: Item[]; update: (id: string, changes: Partial<Item>) => void }) {
  const pending = items.filter((item) => item.status === "needs-review");
  const failure = items.find((item) => item.status === "failed");
  return <section className="mx-auto max-w-3xl rounded-[2rem] border bg-card p-6 sm:p-10"><p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">Import 1 of 1</p><h2 className="font-heading mt-3 text-4xl uppercase">Finish the batch</h2><p className="mt-3 max-w-xl text-sm text-muted-foreground">A single closeout screen turns a large import into a short checklist: resolve exceptions, then save once.</p><ol className="mt-8 space-y-3">{pending.map((item, index) => <li key={item.id} className="flex items-center gap-4 rounded-xl border p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-magenta text-xs font-bold text-white">{index + 1}</span><span className={cn("size-11 shrink-0 rounded-lg", item.tone)} /><div className="min-w-0 flex-1"><p className="font-bold">Confirm {item.name}</p><p className="text-xs text-muted-foreground">{item.category || "Category"} · {item.colour || "Colour"} · {item.brand || "Brand optional"}</p></div><button type="button" onClick={() => update(item.id, { category: item.category || "Tops", colour: item.colour || "Cream" })} className="rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Done</button></li>)}{failure ? <li className="flex items-center gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-destructive text-xs font-bold text-white">!</span><span className="size-11 shrink-0 rounded-lg bg-muted" /><div className="flex-1"><p className="font-bold">Retry {failure.name}</p><p className="text-xs text-muted-foreground">This file never reached review.</p></div><button type="button" className="rounded-full border px-3 py-2 text-xs font-bold">Retry</button></li> : null}</ol><div className="mt-8 flex items-center justify-between border-t pt-5"><p className="text-xs text-muted-foreground">{pending.length} classifications · {failure ? "1 retry" : "No upload failures"}</p><button type="button" className="inline-flex h-10 items-center gap-2 rounded-full bg-cta px-4 text-xs font-bold uppercase text-cta-foreground">Save completed batch <CheckIcon className="size-4" /></button></div></section>;
}

function PrototypeSwitcher({ current }: { current: Variant }) {
  const pathname = usePathname(); const router = useRouter(); const params = useSearchParams();
  const change = (direction: number) => { const index = VARIANTS.findIndex((variant) => variant.key === current); const next = VARIANTS[(index + direction + VARIANTS.length) % VARIANTS.length].key; const nextParams = new URLSearchParams(params.toString()); nextParams.set("variant", next); router.replace(`${pathname}?${nextParams}`, { scroll: false }); };
  React.useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { const target = event.target; if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return; if (event.key === "ArrowLeft") change(-1); if (event.key === "ArrowRight") change(1); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); });
  return <aside aria-label="Wardrobe review prototype switcher" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit items-center gap-1 rounded-full border-2 border-foreground bg-background p-1.5 shadow-[4px_4px_0_var(--foreground)]"><button type="button" onClick={() => change(-1)} className="grid size-9 place-items-center rounded-full hover:bg-accent" aria-label="Show previous prototype"><ArrowLeftIcon className="size-4" /></button><div className="min-w-36 px-2 text-center"><p className="flex items-center justify-center gap-1 text-[10px] font-bold tracking-[0.16em] uppercase"><FlaskConicalIcon className="size-3" /> Prototype</p><p className="text-xs font-semibold">{VARIANTS.find((variant) => variant.key === current)?.label}</p></div><button type="button" onClick={() => change(1)} className="grid size-9 place-items-center rounded-full hover:bg-accent" aria-label="Show next prototype"><ArrowRightIcon className="size-4" /></button></aside>;
}
