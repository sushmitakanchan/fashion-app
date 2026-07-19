"use client";

/**
 * PROTOTYPE — Variant B · "Utility — dense toolbar".
 * Efficient, tool-like, high density.
 * - Save: a compact floating action toolbar over the result image (top-right);
 *   the bookmark icon fills and a "Saved" pill appears in place — no layout shift.
 * - Grid: dense uniform square thumbnails, minimal chrome, small caption below,
 *   provenance shown as tiny coloured dots (link = filled, upload = ring).
 * - Detail: a centred card over a dimmed backdrop; sources in a horizontal strip.
 */

import * as React from "react";
import {
  BookmarkIcon,
  CheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SAVED_LOOKS,
  STAGE_LOOK,
  formatDate,
  sourceCount,
  type SavedLook,
} from "./mock";
import { useSaveState } from "./shared";

export function VariantB() {
  const [selected, setSelected] = React.useState<SavedLook | null>(null);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-14 px-6 py-10">
      <Section label="1 · Save affordance (try-on result stage)">
        <SaveStage />
      </Section>
      <Section label="2 · Style Book grid">
        <Grid onOpen={setSelected} />
      </Section>
      <Section label="3 · Saved look detail (tap a card above, or a default here)">
        <DetailCard
          look={selected ?? SAVED_LOOKS[0]}
          onClose={selected ? () => setSelected(null) : undefined}
        />
      </Section>
    </div>
  );
}

function SaveStage() {
  const { state, save } = useSaveState();
  return (
    <div className="grid gap-3">
      <div className="bg-muted/30 relative grid place-items-center overflow-hidden rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={STAGE_LOOK.lookUrl}
          alt="Your AURA portrait wearing the look"
          className="max-h-[60vh] w-auto rounded-lg object-contain"
        />
        {/* Floating action toolbar */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur">
          <Button variant="ghost" size="icon-sm" aria-label="Generate again">
            <RotateCcwIcon />
          </Button>
          {state === "saved" ? (
            <span className="text-primary inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium">
              <CheckIcon className="size-3.5" /> Saved
            </span>
          ) : (
            <Button
              size="sm"
              onClick={save}
              disabled={state !== "idle"}
              className="rounded-full"
            >
              {state === "saving" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <BookmarkIcon />
              )}
              {state === "saving" ? "Saving" : "Save"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        {STAGE_LOOK.caption} · {sourceCount(STAGE_LOOK.sources.length)} · private
      </p>
    </div>
  );
}

function Grid({ onOpen }: { onOpen: (l: SavedLook) => void }) {
  if (SAVED_LOOKS.length === 0) return <EmptyB />;
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {SAVED_LOOKS.map((look) => (
        <button
          key={look.id}
          type="button"
          onClick={() => onOpen(look)}
          className="group grid gap-1.5 text-left"
        >
          <div className="relative overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={look.lookUrl}
              alt={look.caption}
              className="aspect-square w-full object-cover transition group-hover:opacity-90"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {look.sources.map((s, i) => (
                <span
                  key={i}
                  title={s.kind}
                  className={cn(
                    "size-1.5 rounded-full",
                    s.kind === "link"
                      ? "bg-primary"
                      : "ring-1 ring-muted-foreground/60",
                  )}
                />
              ))}
            </div>
            <p className="text-muted-foreground line-clamp-1 text-xs">
              {look.caption}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function EmptyB() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-16 text-center">
      <p className="text-muted-foreground text-sm">
        No saved looks yet — save one from a try-on.
      </p>
    </div>
  );
}

function DetailCard({
  look,
  onClose,
}: {
  look: SavedLook;
  onClose?: () => void;
}) {
  return (
    <div className="grid place-items-center rounded-xl bg-foreground/[0.04] p-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="grid gap-0.5">
            <p className="font-medium">{look.caption}</p>
            <p className="text-muted-foreground text-xs">
              Saved {formatDate(look.createdAt)}
            </p>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close"
            >
              <XIcon />
            </Button>
          )}
        </div>
        <div className="bg-muted/30 grid place-items-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={look.lookUrl}
            alt={look.caption}
            className="max-h-[52vh] w-auto rounded-lg object-contain"
          />
        </div>
        <div className="grid gap-2 border-t p-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Sources
          </p>
          <div className="flex flex-wrap gap-3">
            {look.sources.map((s, i) => (
              <div key={i} className="flex w-40 items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.image}
                  alt={s.name}
                  className="size-12 rounded-md object-cover"
                />
                <div className="grid min-w-0 gap-0.5">
                  <Badge
                    variant={s.kind === "link" ? "secondary" : "outline"}
                    className="w-fit"
                  >
                    {s.kind}
                  </Badge>
                  {s.kind === "link" ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary truncate text-xs hover:underline"
                    >
                      {s.site}
                    </a>
                  ) : (
                    <span className="text-muted-foreground truncate text-xs">
                      {s.name}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="font-geist-mono">
          {label}
        </Badge>
        <div className="bg-border h-px flex-1" />
      </div>
      {children}
    </section>
  );
}
