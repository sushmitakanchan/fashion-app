"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  Columns2Icon,
  LayersIcon,
  PlusIcon,
  RotateCcwIcon,
  ShirtIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { PrototypeSwitcher } from "@/components/aura/prototype-switcher";
import { cn } from "@/lib/utils";

/**
 * PROTOTYPE — three try-on surfaces, switchable with
 * ?prototype=try-on&variant=A|B|C. Throwaway decision aid for wayfinder #56.
 * Everything is in-memory; nothing submits or persists. The point is to react
 * to six open questions:
 *   1. location   — dedicated route vs. embedded on /aura
 *   2. collection — board / rail / contact-sheet
 *   3. compare    — side-by-side / toggle / overlay slider
 *   4. garment in — dev-only fixture picker, never an upload feature
 *   5. states     — empty / pending / failed (per #55)
 *   6. staleness  — badge+group / filter / grouped-by-subject
 * Each variant deliberately champions a different answer to 1/2/3/6 so the
 * winning design is likely a mix ("A's board with C's overlay compare").
 */

type Variant = "A" | "B" | "C";

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Studio board",
  B: "Look rail",
  C: "Compare lookbook",
};

type LookStatus = "ready" | "pending" | "failed";

type Look = {
  id: string;
  index: number;
  /** An outfit is many garments worn together, generated into ONE result. */
  garments: string[];
  status: LookStatus;
  stale?: boolean;
  savedAgo?: string;
  failure?: string;
};

const CURRENT_LOOKS: Look[] = [
  {
    id: "l3",
    index: 3,
    garments: ["Linen blazer", "White tee", "Tailored trouser"],
    status: "ready",
    savedAgo: "18m ago",
  },
  { id: "l2", index: 2, garments: ["Printed shirt", "Chino"], status: "ready", savedAgo: "2h ago" },
  { id: "l1", index: 1, garments: ["Fitted knit"], status: "ready", savedAgo: "yesterday" },
  { id: "p", index: 4, garments: ["Structured coat"], status: "pending" },
  {
    id: "f",
    index: 5,
    garments: ["Striped knit"],
    status: "failed",
    failure: "Garment image couldn’t be read",
  },
];

const STALE_LOOKS: Look[] = [
  { id: "s2", index: 2, garments: ["Wrap dress"], status: "ready", stale: true, savedAgo: "last week" },
  { id: "s1", index: 1, garments: ["Denim jacket", "Tee"], status: "ready", stale: true, savedAgo: "last week" },
];

const FIXTURES = ["Fitted top", "Linen suit", "Printed shirt", "Structured coat", "Pleated skirt", "Denim jacket"];

/* ------------------------------------------------------------------ shell -- */

export function TryOnSurfacePrototype({ variant }: { variant?: string }) {
  const selected: Variant = variant === "B" || variant === "C" ? variant : "A";
  // Scenario toggle so the #55 states (Q5) are judgeable live, not as a snapshot.
  const [empty, setEmpty] = React.useState(false);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 pb-36">
      <header className="mb-6 grid gap-3 border-b pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid max-w-2xl gap-2">
            <Badge variant="outline">Prototype — not product UI</Badge>
            <h1 className="text-3xl font-medium tracking-tight text-balance">
              Your AURA, styled
            </h1>
            <p className="text-muted-foreground text-pretty">
              The saved portrait is the constant; each look re-dresses that same
              subject from a developer-supplied garment fixture. Comparison — not
              shopping — is the whole job of this surface.
            </p>
          </div>
          <ScenarioControls empty={empty} onEmpty={setEmpty} />
        </div>
        <LocationNote variant={selected} />
      </header>

      {empty ? (
        <EmptyState variant={selected} />
      ) : selected === "A" ? (
        <StudioBoard />
      ) : selected === "B" ? (
        <LookRail />
      ) : (
        <CompareLookbook />
      )}

      <PrototypeSwitcher current={selected} variants={VARIANT_NAMES} />
    </main>
  );
}

function ScenarioControls({ empty, onEmpty }: { empty: boolean; onEmpty: (v: boolean) => void }) {
  return (
    <div className="grid gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Scenario
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant={empty ? "outline" : "default"} onClick={() => onEmpty(false)}>
          Has looks
        </Button>
        <Button size="sm" variant={empty ? "default" : "outline"} onClick={() => onEmpty(true)}>
          First run
        </Button>
      </div>
      {!empty && (
        <span className="text-muted-foreground text-xs">3 ready · 1 pending · 1 failed · 2 stale</span>
      )}
    </div>
  );
}

/** Q1 — each variant states its own answer to "where does this live?". */
function LocationNote({ variant }: { variant: Variant }) {
  const note =
    variant === "A"
      ? "Q1 · Lives on its own protected route (e.g. /aura/studio). The portrait is pinned as a subject anchor."
      : variant === "B"
        ? "Q1 · Embedded on the existing /aura page, as a section directly beneath the portrait result."
        : "Q1 · Its own route, built entirely around comparing two looks.";
  return <p className="text-muted-foreground font-geist-mono text-xs">{note}</p>;
}

/* --------------------------------------------------------------- tiles ------ */

function PortraitTile({ className, label = "Base AURA portrait" }: { className?: string; label?: string }) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-lg border bg-muted",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-secondary" />
      <div className="z-10 grid justify-items-center gap-2 p-4 text-center">
        <UserRoundIcon className="text-muted-foreground size-10" strokeWidth={1.25} />
        <span className="text-muted-foreground font-geist-mono text-[10px] tracking-widest uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}

function LookTile({
  look,
  className,
  showFailure = true,
}: {
  look: Look;
  className?: string;
  showFailure?: boolean;
}) {
  if (look.status === "pending") {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border", className)}>
        <Skeleton className="absolute inset-0" />
        <div className="absolute inset-0 grid place-items-center p-4 text-center">
          <div className="grid justify-items-center gap-2">
            <SparklesIcon className="text-primary size-7 animate-pulse motion-reduce:animate-none" />
            <span className="text-sm font-medium">Making this look…</span>
            <span className="text-muted-foreground text-xs">up to ~2 min</span>
          </div>
        </div>
      </div>
    );
  }
  if (look.status === "failed" && showFailure) {
    return (
      <div
        className={cn(
          "grid place-items-center overflow-hidden rounded-lg border border-dashed p-4 text-center",
          className,
        )}
      >
        <div className="grid justify-items-center gap-2">
          <AlertCircleIcon className="text-destructive size-7" />
          <span className="text-sm font-medium text-pretty">{look.failure}</span>
          <Button size="sm" variant="outline">
            <RotateCcwIcon /> Try again
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-muted" />
      {look.stale && (
        <Badge variant="outline" className="bg-background/80 absolute top-2 left-2 backdrop-blur">
          Older portrait
        </Badge>
      )}
      <div className="z-10 grid justify-items-center gap-2 p-4 text-center">
        <ShirtIcon className="text-primary size-9" strokeWidth={1.25} />
        <span className="text-muted-foreground font-geist-mono text-[10px] leading-relaxed tracking-widest uppercase">
          Look {String(look.index).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

/** An outfit is many garment images → one result. Make that legible. */
function OutfitStrip({ garments }: { garments: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {garments.map((g, i) => (
        <React.Fragment key={g}>
          {i > 0 && <PlusIcon className="text-muted-foreground size-3" />}
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs">
            <ShirtIcon className="size-3" /> {g}
          </span>
        </React.Fragment>
      ))}
      <ArrowRightIcon className="text-muted-foreground mx-0.5 size-3" />
      <span className="text-muted-foreground text-xs font-medium">one look</span>
    </div>
  );
}

/** Q4 — dev-only garment entry. A fixture picker, explicitly not an upload UI. */
function GarmentComposer() {
  const [chosen, setChosen] = React.useState<string[]>(["Linen suit"]);
  const toggle = (g: string) =>
    setChosen((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Compose a look</h3>
          <Badge variant="secondary">dev fixtures</Badge>
        </div>
        <p className="text-muted-foreground text-sm text-pretty">
          Garments come from the development bench — pick any to combine into one
          outfit. This is deliberately not an upload flow.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Garment fixtures">
        {FIXTURES.map((g) => {
          const on = chosen.includes(g);
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggle(g)}
              aria-pressed={on}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              )}
            >
              <ShirtIcon className="size-3.5" /> {g}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {chosen.length} garment{chosen.length === 1 ? "" : "s"} · one generated result
        </span>
        <Button size="sm" disabled={chosen.length === 0}>
          <SparklesIcon /> Generate look
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ empty state -- */

function EmptyState({ variant }: { variant: Variant }) {
  return (
    <div className="grid gap-6">
      <div className="grid place-items-center rounded-xl border border-dashed py-16 text-center">
        <div className="grid max-w-md justify-items-center gap-3 px-6">
          <div className="bg-muted grid size-14 place-items-center rounded-full">
            <ShirtIcon className="text-primary size-7" strokeWidth={1.25} />
          </div>
          <h2 className="text-xl font-medium">No looks yet</h2>
          <p className="text-muted-foreground text-pretty">
            Your AURA portrait is ready. Try a garment on it to start a
            collection — every result is saved so you can compare looks later.
          </p>
          <div className="mt-1 flex items-center gap-3">
            <PortraitTile className="size-24" label="Ready" />
            <ArrowRightIcon className="text-muted-foreground size-5" />
            <div className="border-border grid size-24 place-items-center rounded-lg border border-dashed">
              <PlusIcon className="text-muted-foreground size-6" />
            </div>
          </div>
          <Button className="mt-2">
            <SparklesIcon /> Try on a look
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground font-geist-mono text-center text-xs">
        First-run empty state · variant {variant}
      </p>
    </div>
  );
}

/* ---------------------------------------------------- A · Studio board ----- */
/* Dedicated route · subject-pinned board · side-by-side compare · badge+group */

function StudioBoard() {
  const ready = CURRENT_LOOKS.filter((l) => l.status === "ready");
  const [selected, setSelected] = React.useState<string>(ready[0]?.id ?? "");
  const selectedLook = [...CURRENT_LOOKS, ...STALE_LOOKS].find((l) => l.id === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-6">
        {/* Side-by-side compare: base is pinned, selected look sits beside it. */}
        <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="grid gap-0.5">
              <h2 className="font-medium">Compared with your portrait</h2>
              <p className="text-muted-foreground text-sm">
                Q3 · Side by side — the base stays put, the outfit changes.
              </p>
            </div>
            <Badge variant="secondary">
              <Columns2Icon /> Side by side
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="grid gap-2">
              <PortraitTile className="min-h-64" />
              <figcaption className="text-muted-foreground text-sm">Base portrait · current</figcaption>
            </figure>
            <figure className="grid gap-2">
              {selectedLook ? <LookTile look={selectedLook} className="min-h-64" /> : null}
              <figcaption className="text-muted-foreground grid gap-1 text-sm">
                <span>
                  Look {selectedLook ? String(selectedLook.index).padStart(2, "0") : "—"}
                  {selectedLook?.stale && " · from an older portrait"}
                </span>
                {selectedLook && <OutfitStrip garments={selectedLook.garments} />}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Board of saved looks; current group + a separated stale group (Q6). */}
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Saved looks</h2>
            <span className="text-muted-foreground text-sm">{ready.length} on this portrait</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CURRENT_LOOKS.map((look) => (
              <BoardCell
                key={look.id}
                look={look}
                active={look.id === selected}
                onSelect={() => look.status === "ready" && setSelected(look.id)}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              From a previous portrait
            </span>
            <Separator className="flex-1" />
          </div>
          <p className="text-muted-foreground -mt-1 text-xs">
            Q6 · These were made before you regenerated — badged and grouped, never
            silently mixed into the current set.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STALE_LOOKS.map((look) => (
              <BoardCell
                key={look.id}
                look={look}
                active={look.id === selected}
                onSelect={() => setSelected(look.id)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="grid content-start gap-4">
        <GarmentComposer />
      </div>
    </div>
  );
}

function BoardCell({
  look,
  active,
  onSelect,
}: {
  look: Look;
  active: boolean;
  onSelect: () => void;
}) {
  // Only a ready look is selectable — a pending/failed cell can't be a <button>
  // anyway, since its own contents (the retry button) would nest a button.
  const selectable = look.status === "ready";
  const cls = cn(
    "grid gap-2 rounded-xl border p-2 text-left transition-colors",
    active ? "border-primary ring-ring/30 ring-2" : selectable && "hover:bg-muted",
  );
  const inner = (
    <>
      <LookTile look={look} className="min-h-32" />
      <span className="text-xs font-medium">
        Look {String(look.index).padStart(2, "0")}
        {look.stale && <span className="text-muted-foreground"> · older</span>}
      </span>
    </>
  );
  return selectable ? (
    <button type="button" onClick={onSelect} aria-pressed={active} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/* ------------------------------------------------------ B · Look rail ------ */
/* Embedded on /aura · horizontal rail · in-place toggle · stale filtered out */

function LookRail() {
  const [selected, setSelected] = React.useState("l3");
  const [frame, setFrame] = React.useState<"base" | "look">("look");
  const [showStale, setShowStale] = React.useState(false);
  const rail = showStale ? [...CURRENT_LOOKS, ...STALE_LOOKS] : CURRENT_LOOKS;
  const selectedLook = [...CURRENT_LOOKS, ...STALE_LOOKS].find((l) => l.id === selected);

  return (
    <div className="grid gap-6">
      {/* Simulated /aura context: the portrait result section stays above. */}
      <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
        <UserRoundIcon className="size-3.5" /> Your AURA portrait &amp; “Edit profile”
        sit here — try-on is the section below.
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* In-place toggle compare: one frame flips between base and look (Q3). */}
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-medium">Try on a look</h2>
            <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Compare toggle">
              <Button
                size="sm"
                variant={frame === "base" ? "default" : "ghost"}
                onClick={() => setFrame("base")}
              >
                Original
              </Button>
              <Button
                size="sm"
                variant={frame === "look" ? "default" : "ghost"}
                onClick={() => setFrame("look")}
              >
                This look
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground -mt-1 text-sm">
            Q3 · Toggle — flip the same frame between your portrait and the look,
            in place.
          </p>
          {frame === "base" || !selectedLook ? (
            <PortraitTile className="min-h-80" />
          ) : (
            <LookTile look={selectedLook} className="min-h-80" />
          )}
          {selectedLook && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <OutfitStrip garments={selectedLook.garments} />
              {selectedLook.stale && <Badge variant="outline">Older portrait</Badge>}
            </div>
          )}
        </div>

        <div className="grid content-start gap-4">
          <GarmentComposer />
        </div>
      </section>

      {/* The rail — the persisted collection as a filmstrip. */}
      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Your looks</h3>
          <button
            type="button"
            onClick={() => setShowStale((s) => !s)}
            className="text-primary text-sm hover:underline"
          >
            {showStale ? "Hide" : "Show"} {STALE_LOOKS.length} from older portraits
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          Q2 · A horizontal rail. Q6 · Looks from an older portrait are hidden by
          default, revealed on demand.
        </p>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <div className="grid w-32 shrink-0 gap-1.5">
            <PortraitTile className="h-40" label="Base" />
            <span className="text-muted-foreground text-center text-xs">Your portrait</span>
          </div>
          <Separator orientation="vertical" className="h-40" />
          {rail.map((look) => {
            const selectable = look.status === "ready";
            const cls = cn(
              "grid w-32 shrink-0 gap-1.5 rounded-lg p-1 text-left transition-colors",
              look.id === selected ? "ring-ring/40 ring-2" : selectable && "hover:bg-muted",
            );
            const inner = (
              <>
                <LookTile look={look} className="h-40" />
                <span className="truncate text-center text-xs font-medium">
                  Look {String(look.index).padStart(2, "0")}
                  {look.stale && " · older"}
                </span>
              </>
            );
            return selectable ? (
              <button
                key={look.id}
                type="button"
                onClick={() => {
                  setSelected(look.id);
                  setFrame("look");
                }}
                aria-pressed={look.id === selected}
                className={cls}
              >
                {inner}
              </button>
            ) : (
              <div key={look.id} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------- C · Compare lookbook --- */
/* Dedicated route · contact sheet grouped by subject · overlay slider compare */

function CompareLookbook() {
  const [left, setLeft] = React.useState<"base" | string>("base");
  const [right, setRight] = React.useState<string>("l3");
  const [mode, setMode] = React.useState<"overlay" | "split">("overlay");
  const [pct, setPct] = React.useState(50);
  const all = [...CURRENT_LOOKS, ...STALE_LOOKS];
  const leftLook = left === "base" ? null : all.find((l) => l.id === left);
  const rightLook = all.find((l) => l.id === right);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <h2 className="text-xl font-medium">Compare two looks</h2>
            <p className="text-muted-foreground text-sm">
              Q3 · Overlay — drag the divider to wipe between them. The whole page
              is the comparison.
            </p>
          </div>
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="Compare mode">
            <Button size="sm" variant={mode === "overlay" ? "default" : "ghost"} onClick={() => setMode("overlay")}>
              <LayersIcon /> Overlay
            </Button>
            <Button size="sm" variant={mode === "split" ? "default" : "ghost"} onClick={() => setMode("split")}>
              <Columns2Icon /> Split
            </Button>
          </div>
        </div>

        {mode === "overlay" ? (
          <div className="grid gap-2">
            <div className="relative min-h-96 overflow-hidden rounded-xl border">
              {/* bottom layer = right pane */}
              <PaneTile look={rightLook} isBase={false} className="absolute inset-0" />
              {/* top layer = left pane, clipped by the slider */}
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
                <PaneTile look={leftLook} isBase={left === "base"} className="h-full" />
              </div>
              <div className="bg-primary absolute inset-y-0 w-0.5" style={{ left: `${pct}%` }} aria-hidden />
              <label className="sr-only" htmlFor="wipe">
                Wipe between looks
              </label>
              <input
                id="wipe"
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="accent-primary absolute inset-x-0 bottom-3 mx-auto w-[92%] cursor-ew-resize"
              />
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{left === "base" ? "Base portrait" : `Look ${leftLook ? String(leftLook.index).padStart(2, "0") : ""}`}</span>
              <span>Look {rightLook ? String(rightLook.index).padStart(2, "0") : ""}</span>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <PaneTile look={leftLook} isBase={left === "base"} className="min-h-96" />
            <PaneTile look={rightLook} isBase={false} className="min-h-96" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Comparing:</span>
          <span className="font-medium">
            {left === "base" ? "Base portrait" : `Look ${leftLook ? String(leftLook.index).padStart(2, "0") : ""}`}
          </span>
          <ArrowRightIcon className="text-muted-foreground size-3.5" />
          <span className="font-medium">Look {rightLook ? String(rightLook.index).padStart(2, "0") : ""}</span>
          {rightLook && <OutfitStrip garments={rightLook.garments} />}
        </div>
      </div>

      {/* Contact sheet grouped by subject (Q2 + Q6). Click sets the right pane. */}
      <aside className="grid content-start gap-4">
        <div className="grid gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Set panes
          </span>
          <div className="grid gap-1 text-sm">
            <button
              type="button"
              onClick={() => setLeft("base")}
              className={cn("rounded-md border px-2 py-1 text-left", left === "base" ? "border-primary" : "hover:bg-muted")}
            >
              Left: Base portrait
            </button>
            <span className="text-muted-foreground text-xs">Right pane: click any look below.</span>
          </div>
        </div>

        <ContactGroup title="Current portrait" looks={CURRENT_LOOKS} right={right} onPick={setRight} />
        <ContactGroup title="Previous portrait" looks={STALE_LOOKS} right={right} onPick={setRight} muted />
        <GarmentComposer />
      </aside>
    </div>
  );
}

function ContactGroup({
  title,
  looks,
  right,
  onPick,
  muted = false,
}: {
  title: string;
  looks: Look[];
  right: string;
  onPick: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {muted && <Badge variant="outline">older</Badge>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {looks.map((look) => {
          const selectable = look.status === "ready";
          const cls = cn(
            "overflow-hidden rounded-lg border transition-colors",
            look.id === right ? "border-primary ring-ring/30 ring-2" : selectable && "hover:bg-muted",
          );
          return selectable ? (
            <button
              key={look.id}
              type="button"
              onClick={() => onPick(look.id)}
              aria-pressed={look.id === right}
              className={cls}
            >
              <LookTile look={look} className="min-h-24" />
            </button>
          ) : (
            <div key={look.id} className={cls}>
              <LookTile look={look} className="min-h-24" showFailure={false} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PaneTile({ look, isBase, className }: { look: Look | null | undefined; isBase: boolean; className?: string }) {
  if (isBase || !look) return <PortraitTile className={cn("min-h-96", className)} />;
  return <LookTile look={look} className={cn("min-h-96", className)} />;
}
