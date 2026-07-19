"use client";

/**
 * PROTOTYPE — Variant A · "Editorial — full-bleed".
 * Big imagery, generous whitespace, gallery feel.
 * - Save: a wide save bar directly under the result image; save is the loud
 *   primary; once saved it flips to a "View in Style Book" link + checkmark.
 * - Grid: two large columns of tall look cards; caption + source count overlaid.
 * - Detail: full-bleed look on the left, sources as a tall rail on the right.
 */

import * as React from "react";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  CheckIcon,
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  RotateCcwIcon,
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

export function VariantA() {
  const [selected, setSelected] = React.useState<SavedLook>(SAVED_LOOKS[0]);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-16 px-6 py-10">
      <Section label="1 · Save affordance (try-on result stage)">
        <SaveStage />
      </Section>
      <Section label="2 · Style Book grid">
        <Grid onOpen={setSelected} selectedId={selected.id} />
      </Section>
      <Section label="3 · Saved look detail">
        <Detail look={selected} />
      </Section>
    </div>
  );
}

function SaveStage() {
  const { state, save } = useSaveState();
  return (
    <figure className="grid gap-4">
      <div className="bg-muted/30 grid place-items-center overflow-hidden rounded-2xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={STAGE_LOOK.lookUrl}
          alt="Your AURA portrait wearing the look"
          className="max-h-[64vh] w-auto rounded-xl object-contain"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4">
        <div className="grid gap-0.5">
          <p className="font-medium">{STAGE_LOOK.caption}</p>
          <p className="text-muted-foreground text-xs">
            {sourceCount(STAGE_LOOK.sources.length)} · kept privately, only you
            can see it
          </p>
        </div>
        {state === "saved" ? (
          <div className="flex items-center gap-3">
            <span className="text-primary inline-flex items-center gap-1.5 text-sm font-medium">
              <CheckIcon className="size-4" /> Saved
            </span>
            <Button variant="outline">
              View in Style Book <ArrowUpRightIcon />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost">
              <RotateCcwIcon /> Generate again
            </Button>
            <Button onClick={save} disabled={state !== "idle"} className="min-w-40">
              {state === "saving" ? (
                <>
                  <Loader2Icon className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <BookmarkIcon /> Save to Style Book
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </figure>
  );
}

function Grid({
  onOpen,
  selectedId,
}: {
  onOpen: (l: SavedLook) => void;
  selectedId: string;
}) {
  if (SAVED_LOOKS.length === 0) return <EmptyA />;
  return (
    <div className="grid grid-cols-2 gap-6">
      {SAVED_LOOKS.map((look) => (
        <button
          key={look.id}
          type="button"
          onClick={() => onOpen(look)}
          className={cn(
            "group relative overflow-hidden rounded-2xl border text-left transition-all hover:shadow-lg",
            look.id === selectedId && "ring-primary ring-2",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={look.lookUrl}
            alt={look.caption}
            className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
            <p className="line-clamp-1 font-medium text-white">{look.caption}</p>
            <p className="text-xs text-white/70">
              {formatDate(look.createdAt)} · {sourceCount(look.sources.length)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function EmptyA() {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-center">
      <div className="grid max-w-sm justify-items-center gap-2">
        <BookmarkIcon className="text-muted-foreground size-8" />
        <p className="text-lg font-medium">Your Style Book is empty</p>
        <p className="text-muted-foreground text-sm">
          Save a look from a try-on and it lands here.
        </p>
      </div>
    </div>
  );
}

function Detail({ look }: { look: SavedLook }) {
  return (
    <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
      <figure className="bg-muted/30 grid place-items-center overflow-hidden rounded-2xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={look.lookUrl}
          alt={look.caption}
          className="max-h-[70vh] w-auto rounded-xl object-contain"
        />
      </figure>
      <div className="grid content-start gap-5">
        <div className="grid gap-1">
          <h3 className="text-xl font-medium text-balance">{look.caption}</h3>
          <p className="text-muted-foreground text-sm">
            Saved {formatDate(look.createdAt)}
          </p>
        </div>
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Sources
          </p>
          {look.sources.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border bg-card p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image}
                alt={s.name}
                className="size-16 rounded-lg object-cover"
              />
              <div className="grid min-w-0 gap-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                {s.kind === "link" ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    <LinkIcon className="size-3" /> from {s.site}
                  </a>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                    <ImageIcon className="size-3" /> uploaded image
                  </span>
                )}
              </div>
              <Badge
                variant={s.kind === "link" ? "secondary" : "outline"}
                className="mr-1 ml-auto"
              >
                {s.kind}
              </Badge>
            </div>
          ))}
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
