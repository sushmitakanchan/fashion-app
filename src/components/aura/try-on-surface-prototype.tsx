"use client";

import * as React from "react";
import {
  AlertCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * PROTOTYPE — the AURA try-on flow, at ?prototype=try-on. Throwaway decision
 * aid for wayfinder #56 after the scope was reduced to: a dedicated route that
 * accepts a garment-image upload and displays the resulting outfit worn on the
 * user's AURA portrait — nothing more. No comparison, no saving (out of scope).
 *
 *   attach a garment image  →  generate onto your fixed AURA portrait  →  view
 *
 * Everything is in-memory and cleared on reload; nothing is uploaded or saved.
 */

type Garment = { id: string; name: string; url: string };
type Look = {
  id: string;
  garments: Garment[];
  /** stand-in for the generated result image (see the caption in the stage) */
  resultUrl: string;
};

export function TryOnSurfacePrototype() {
  const idRef = React.useRef(0);
  const nextId = () => String(++idRef.current);

  const [attached, setAttached] = React.useState<Garment[]>([]);
  const [result, setResult] = React.useState<Look | null>(null);
  const [phase, setPhase] = React.useState<"idle" | "generating" | "failed">("idle");
  const [failNext, setFailNext] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const lastAttempt = React.useRef<Garment[]>([]);

  function onFiles(list: FileList | null) {
    if (!list) return;
    const added = Array.from(list).map((f) => ({
      id: nextId(),
      name: f.name.replace(/\.[^.]+$/, ""),
      url: URL.createObjectURL(f),
    }));
    setAttached((prev) => [...prev, ...added]);
  }

  function generate(from: Garment[]) {
    if (from.length === 0) return;
    lastAttempt.current = from;
    setPhase("generating");
    setResult(null);
    window.setTimeout(() => {
      if (failNext) {
        setPhase("failed");
        return;
      }
      setResult({ id: nextId(), garments: from, resultUrl: from[0].url });
      setAttached([]);
      setPhase("idle");
    }, 1400);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 grid gap-2 border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">Prototype — not product UI</Badge>
          <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs select-none">
            <input
              type="checkbox"
              checked={failNext}
              onChange={(e) => setFailNext(e.target.checked)}
              className="accent-primary"
            />
            simulate: next generate fails
          </label>
        </div>
        <h1 className="text-3xl font-medium tracking-tight text-balance">Try on a look</h1>
        <p className="text-muted-foreground text-pretty">
          Attach a garment image and see it worn on your AURA portrait. This is a
          throwaway prototype — nothing is uploaded or saved.
        </p>
      </header>

      {/* ---- Stage: empty / generating / failed / the generated outfit ---- */}
      <section className="grid gap-3">
        {phase === "generating" ? (
          <GeneratingStage />
        ) : phase === "failed" ? (
          <FailedStage onRetry={() => generate(lastAttempt.current)} />
        ) : result ? (
          <ResultStage look={result} />
        ) : (
          <EmptyStage onAttach={() => fileRef.current?.click()} />
        )}
      </section>

      {/* ---- Composer: attach garment image(s) → generate one look ---- */}
      <section className="mt-8 grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Attach a garment</h2>
          <Badge variant="secondary">one look = one or more pieces</Badge>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {attached.length === 0 ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-border hover:bg-muted grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors"
          >
            <UploadIcon className="text-muted-foreground size-6" />
            <span className="text-sm font-medium">Choose a garment image</span>
            <span className="text-muted-foreground text-xs">
              You supply the image — this isn’t a catalog. PNG/JPG.
            </span>
          </button>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {attached.map((g) => (
                <div key={g.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.url}
                    alt={g.name}
                    className="border-border size-20 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setAttached((prev) => prev.filter((x) => x.id !== g.id))}
                    aria-label={`Remove ${g.name}`}
                    className="bg-background absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Add another garment"
                className="border-border text-muted-foreground hover:bg-muted grid size-20 place-items-center rounded-lg border border-dashed"
              >
                <PlusIcon className="size-5" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs">
                {attached.length} piece{attached.length === 1 ? "" : "s"} · worn together in one result
              </span>
              <Button onClick={() => generate(attached)}>
                <SparklesIcon /> Generate look
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/* ------------------------------------------------------------- stages ----- */

function EmptyStage({ onAttach }: { onAttach: () => void }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-14 text-center">
      <div className="grid max-w-sm justify-items-center gap-3 px-6">
        <div className="flex items-center gap-3">
          <PortraitTile className="size-24" />
          <PlusIcon className="text-muted-foreground size-5" />
          <div className="border-border grid size-24 place-items-center rounded-lg border border-dashed">
            <UploadIcon className="text-muted-foreground size-6" />
          </div>
        </div>
        <h2 className="text-lg font-medium">See a garment on your portrait</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          Your AURA portrait is the fixed subject. Attach a garment image and
          generate the look.
        </p>
        <Button onClick={onAttach}>
          <UploadIcon /> Attach a garment
        </Button>
      </div>
    </div>
  );
}

function GeneratingStage() {
  return (
    <div className="relative min-h-96 overflow-hidden rounded-xl border" aria-busy>
      <Skeleton className="absolute inset-0" />
      <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center p-6 text-center">
        <div className="grid justify-items-center gap-3">
          <SparklesIcon className="text-primary size-9 animate-pulse motion-reduce:animate-none" />
          <p className="font-medium">Putting the look together…</p>
          <p className="text-muted-foreground text-sm">This can take up to ~2 minutes.</p>
        </div>
      </div>
    </div>
  );
}

function FailedStage({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-xl border border-dashed p-6 text-center">
      <div className="grid max-w-sm justify-items-center gap-3">
        <AlertCircleIcon className="text-destructive size-9" />
        <h2 className="font-medium">That try-on didn’t come through</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          Nothing was saved. You can try the same garment again.
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RotateCcwIcon /> Try again
        </Button>
      </div>
    </div>
  );
}

function ResultStage({ look }: { look: Look }) {
  return (
    <figure className="grid gap-2">
      <div className="bg-muted/30 grid place-items-center overflow-hidden rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={look.resultUrl}
          alt="Your AURA portrait wearing the garment"
          className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
        />
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {look.garments.map((g) => g.name).join(" + ")} — prototype stand-in for the generated result
        (the real flow renders your portrait wearing the garment).
      </figcaption>
    </figure>
  );
}

function PortraitTile({ className }: { className?: string }) {
  return (
    <div className={cn("bg-muted relative grid place-items-center overflow-hidden rounded-lg border", className)}>
      <div className="bg-secondary absolute inset-x-0 top-0 h-1/2" />
      <div className="z-10 grid justify-items-center gap-2 p-4 text-center">
        <UserRoundIcon className="text-muted-foreground size-10" strokeWidth={1.25} />
        <span className="text-muted-foreground font-geist-mono text-[10px] tracking-widest uppercase">
          Your AURA portrait
        </span>
      </div>
    </div>
  );
}
