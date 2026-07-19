import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleDashedIcon,
  Clock3Icon,
  Columns2Icon,
  ShirtIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrototypeSwitcher } from "@/components/aura/prototype-switcher";
import { cn } from "@/lib/utils";

/**
 * PROTOTYPE — Three try-on surfaces on the existing /aura route, switchable
 * with ?prototype=try-on&variant=A|B|C. This is a visual decision aid only;
 * fixtures are in memory and none of the controls submit or persist data.
 */

type Variant = "A" | "B" | "C";

const VARIANT_NAMES: Record<Variant, string> = {
  A: "Studio board",
  B: "Look rail",
  C: "Try-on journal",
};

export function TryOnSurfacePrototype({ variant }: { variant?: string }) {
  const selectedVariant: Variant = variant === "B" || variant === "C" ? variant : "A";

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 pb-32">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div className="grid max-w-2xl gap-2">
          <Badge variant="outline">Prototype — not product UI</Badge>
          <h1 className="text-3xl font-medium tracking-tight">Your AURA, styled</h1>
          <p className="text-muted-foreground text-pretty">
            A saved portrait is the constant. Each look is an immutable result
            from a developer-supplied garment fixture, so comparison—not
            shopping—is the job of this surface.
          </p>
        </div>
        <PrototypeState />
      </div>

      {selectedVariant === "A" ? (
        <StudioBoardVariant />
      ) : selectedVariant === "B" ? (
        <LookRailVariant />
      ) : (
        <TryOnJournalVariant />
      )}
      <PrototypeSwitcher current={selectedVariant} variants={VARIANT_NAMES} />
    </main>
  );
}

function PrototypeState() {
  return (
    <div className="grid gap-1 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
      <span className="font-medium">Prototype state</span>
      <span className="text-muted-foreground">1 portrait · 3 finished · 1 pending · 1 failed</span>
    </div>
  );
}

function PortraitPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative grid min-h-52 place-items-center overflow-hidden rounded-lg border bg-muted/70",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-secondary/70" />
      <div className="z-10 grid justify-items-center gap-2 text-center">
        <UserRoundIcon className="size-12 text-muted-foreground" strokeWidth={1.25} />
        <span className="font-geist-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Base AURA portrait
        </span>
      </div>
    </div>
  );
}

function LookPlaceholder({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "relative grid min-h-44 place-items-center overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-muted" />
      <div className="z-10 grid justify-items-center gap-2 text-center">
        <ShirtIcon className="size-10 text-primary" strokeWidth={1.25} />
        <span className="font-geist-mono px-3 text-[10px] leading-relaxed tracking-widest text-muted-foreground uppercase">
          {name}
        </span>
      </div>
    </div>
  );
}

function ComparePair({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <section className={cn("grid gap-3", compact ? "" : "rounded-xl border bg-card p-4 shadow-sm")}>
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 className="font-medium">{title}</h2>
          <p className="text-muted-foreground text-sm">Same subject, only the outfit changes.</p>
        </div>
        <Badge variant="secondary">
          <Columns2Icon /> Compare
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="grid gap-2">
          <PortraitPlaceholder />
          <figcaption className="text-muted-foreground text-sm">Base portrait</figcaption>
        </figure>
        <figure className="grid gap-2">
          <LookPlaceholder name="Linen suit" />
          <figcaption className="text-muted-foreground text-sm">Look 03 · Linen suit</figcaption>
        </figure>
      </div>
    </section>
  );
}

function StudioBoardVariant() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]">
      <ComparePair title="Current comparison" />
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Try another fixture</CardTitle>
            <CardDescription>
              Garments arrive from the development bench; this is intentionally not an upload flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-3 gap-2" aria-label="Developer garment fixtures">
              {[
                ["Fitted top", "Ready"],
                ["Linen suit", "Ready"],
                ["Printed shirt", "Ready"],
              ].map(([name, state]) => (
                <div key={name} className="grid gap-2 rounded-lg border bg-muted/30 p-2">
                  <ShirtIcon className="size-5 text-primary" strokeWidth={1.25} />
                  <span className="text-xs font-medium">{name}</span>
                  <span className="text-muted-foreground text-xs">{state}</span>
                </div>
              ))}
            </div>
            <Button disabled className="w-full">
              <SparklesIcon /> Generate look
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Saved looks</h2>
            <span className="text-muted-foreground text-sm">3 results</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Look 01", "Fitted top"],
              ["Look 02", "Printed shirt"],
              ["Look 03", "Linen suit"],
            ].map(([look, garment], index) => (
              <button
                key={look}
                type="button"
                className={cn(
                  "grid gap-2 rounded-xl border p-2 text-left transition-colors hover:bg-muted",
                  index === 2 && "border-primary ring-2 ring-ring/25",
                )}
              >
                <LookPlaceholder name={garment} className="min-h-28" />
                <span className="text-xs font-medium">{look}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function LookRailVariant() {
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-1">
          <Badge variant="secondary">Fixed subject</Badge>
          <h2 className="text-lg font-medium">Your AURA portrait</h2>
          <p className="text-muted-foreground text-sm">Every look below starts here.</p>
        </div>
        <PortraitPlaceholder className="min-h-80" />
        <div className="border-t pt-4">
          <p className="text-muted-foreground text-sm">Compare any two saved looks with the base portrait held in view.</p>
        </div>
      </aside>

      <div className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="text-2xl font-medium">Looks to compare</h2>
            <p className="text-muted-foreground">A visual rail makes the persisted collection the primary surface.</p>
          </div>
          <Badge variant="outline">2 selected</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["Look 03", "Linen suit", "Selected"],
            ["Look 02", "Printed shirt", "Selected"],
            ["Look 01", "Fitted top", "Finished"],
            ["New fixture", "Generating", "Pending"],
            ["Look 00", "Coat", "Could not generate"],
          ].map(([title, garment, state]) => (
            <article key={title} className="grid gap-3 rounded-xl border bg-card p-3 shadow-sm">
              {state === "Pending" ? (
                <div className="grid min-h-44 place-items-center rounded-lg border border-dashed bg-muted/30 text-center">
                  <div className="grid justify-items-center gap-2">
                    <CircleDashedIcon className="size-8 animate-spin text-primary motion-reduce:animate-none" />
                    <span className="text-sm font-medium">Making this look</span>
                  </div>
                </div>
              ) : state === "Could not generate" ? (
                <div className="grid min-h-44 place-items-center rounded-lg border border-dashed bg-muted/30 p-4 text-center">
                  <div className="grid justify-items-center gap-2">
                    <AlertCircleIcon className="size-8 text-destructive" />
                    <span className="text-sm font-medium">Result unavailable</span>
                  </div>
                </div>
              ) : (
                <LookPlaceholder name={garment} />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="grid gap-0.5">
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-muted-foreground text-sm">{garment}</p>
                </div>
                <Badge variant={state === "Selected" ? "default" : "outline"}>{state}</Badge>
              </div>
            </article>
          ))}
        </div>

        <div className="sticky bottom-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm font-medium">Look 03 and Look 02 are selected</span>
          <Button disabled size="sm">
            <Columns2Icon /> Open comparison
          </Button>
        </div>
      </div>
    </div>
  );
}

function TryOnJournalVariant() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid gap-4">
        <div className="flex items-end justify-between gap-4 border-b pb-4">
          <div className="grid gap-1">
            <h2 className="text-2xl font-medium">A record of your looks</h2>
            <p className="text-muted-foreground">A chronological stack makes provenance and recovery legible.</p>
          </div>
          <Badge variant="outline">5 attempts</Badge>
        </div>
        <ol className="grid gap-3">
          {[
            ["Look 03", "Linen suit", "Ready", CheckIcon],
            ["Look 02", "Printed shirt", "Ready", CheckIcon],
            ["Look 01", "Fitted top", "Ready", CheckIcon],
            ["Look 04", "Structured coat", "Generating", CircleDashedIcon],
            ["Look 00", "Striped knit", "Failed", AlertCircleIcon],
          ].map(([title, garment, status, Icon], index) => {
            const StatusIcon = Icon as typeof CheckIcon;
            return (
              <li key={title as string} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                <div className="grid size-10 place-items-center rounded-lg bg-muted">
                  <StatusIcon
                    className={cn(
                      "size-5",
                      status === "Failed" ? "text-destructive" : status === "Generating" ? "animate-spin text-primary motion-reduce:animate-none" : "text-primary",
                    )}
                  />
                </div>
                <div className="grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{title as string}</h3>
                    {index === 0 && <Badge variant="secondary">In comparison</Badge>}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {garment as string} · {status as string}
                  </p>
                </div>
                <ArrowRightIcon className="size-4 text-muted-foreground" />
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="grid gap-1">
          <Badge variant="secondary">Comparison tray</Badge>
          <h2 className="text-lg font-medium">Look 03 against your portrait</h2>
        </div>
        <PortraitPlaceholder className="min-h-40" />
        <ArrowRightIcon className="mx-auto size-5 text-muted-foreground" />
        <LookPlaceholder name="Linen suit" className="min-h-40" />
        <div className="grid gap-2 border-t pt-4 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock3Icon className="size-4" /> Saved 18 minutes ago
          </div>
          <Button disabled size="sm" variant="outline">
            <Columns2Icon /> Change comparison
          </Button>
        </div>
      </aside>
    </div>
  );
}
