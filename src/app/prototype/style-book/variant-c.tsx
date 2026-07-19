"use client";

/**
 * PROTOTYPE — Variant C · "Library — list + panel".
 * Structured, document-like, provenance-forward.
 * - Save: a dedicated "Keep this look" panel under the result — explanatory,
 *   with the privacy/consent note inline; save resolves within the panel.
 * - Grid: not a grid — a newest-first list of rows (thumbnail + caption +
 *   inline source chips + date), scannable like a library index.
 * - Detail: two panes — look on the left, a structured "Provenance" list on the
 *   right, one row per source with kind badge and the original link spelled out.
 */

import * as React from "react";
import {
  BookmarkIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ImageIcon,
  Loader2Icon,
  LinkIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  SAVED_LOOKS,
  STAGE_LOOK,
  formatDate,
  sourceCount,
  type SavedLook,
} from "./mock";
import { useSaveState } from "./shared";

export function VariantC() {
  const [selected, setSelected] = React.useState<SavedLook>(SAVED_LOOKS[0]);
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-14 px-6 py-10">
      <Section label="1 · Save affordance (try-on result stage)">
        <SaveStage />
      </Section>
      <Section label="2 · Style Book list">
        <List onOpen={setSelected} selectedId={selected.id} />
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
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <div className="bg-muted/30 grid place-items-center overflow-hidden rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={STAGE_LOOK.lookUrl}
          alt="Your AURA portrait wearing the look"
          className="max-h-[56vh] w-auto rounded-lg object-contain"
        />
      </div>
      <aside className="grid content-start gap-3 rounded-xl border bg-card p-4">
        <div className="grid gap-1">
          <h3 className="font-medium">Keep this look</h3>
          <p className="text-muted-foreground text-sm text-pretty">
            Save {STAGE_LOOK.caption.toLowerCase()} to your Style Book with its{" "}
            {sourceCount(STAGE_LOOK.sources.length)}.
          </p>
        </div>
        {state === "saved" ? (
          <div className="grid gap-3">
            <div className="text-primary flex items-center gap-2 text-sm font-medium">
              <CheckCircle2Icon className="size-4" /> Saved to your Style Book
            </div>
            <Button variant="outline" className="w-full">
              View in Style Book
            </Button>
          </div>
        ) : (
          <Button
            onClick={save}
            disabled={state !== "idle"}
            className="w-full"
          >
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
        )}
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
          Private to you. Saved looks keep the portrait as it looked at save time.
        </p>
      </aside>
    </div>
  );
}

function List({
  onOpen,
  selectedId,
}: {
  onOpen: (l: SavedLook) => void;
  selectedId: string;
}) {
  if (SAVED_LOOKS.length === 0) return <EmptyC />;
  return (
    <div className="overflow-hidden rounded-xl border">
      {SAVED_LOOKS.map((look, i) => (
        <button
          key={look.id}
          type="button"
          onClick={() => onOpen(look)}
          className={cn(
            "flex w-full items-center gap-4 px-3 py-3 text-left transition-colors hover:bg-muted/60",
            i > 0 && "border-t",
            look.id === selectedId && "bg-muted",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={look.lookUrl}
            alt={look.caption}
            className="size-14 rounded-lg border object-cover"
          />
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="truncate font-medium">{look.caption}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {look.sources.map((s, j) => (
                <span
                  key={j}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]",
                    s.kind === "link"
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground border",
                  )}
                >
                  {s.kind === "link" ? (
                    <LinkIcon className="size-2.5" />
                  ) : (
                    <ImageIcon className="size-2.5" />
                  )}
                  {s.kind === "link" ? s.site : "upload"}
                </span>
              ))}
            </div>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatDate(look.createdAt)}
          </span>
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
        </button>
      ))}
    </div>
  );
}

function EmptyC() {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed py-16 text-center">
      <div className="grid max-w-sm justify-items-center gap-1">
        <p className="font-medium">No looks in your Style Book</p>
        <p className="text-muted-foreground text-sm">
          Each look you save from a try-on appears here, newest first.
        </p>
      </div>
    </div>
  );
}

function Detail({ look }: { look: SavedLook }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <figure className="bg-muted/30 grid place-items-center overflow-hidden rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={look.lookUrl}
          alt={look.caption}
          className="max-h-[64vh] w-auto rounded-lg object-contain"
        />
      </figure>
      <div className="grid content-start gap-4">
        <div className="grid gap-1">
          <h3 className="text-lg font-medium text-balance">{look.caption}</h3>
          <p className="text-muted-foreground text-sm">
            Saved {formatDate(look.createdAt)} ·{" "}
            {sourceCount(look.sources.length)}
          </p>
        </div>
        <Separator />
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Provenance
          </p>
          {look.sources.map((s, i) => (
            <div key={i} className="grid gap-2">
              {i > 0 && <Separator />}
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.image}
                  alt={s.name}
                  className="size-14 rounded-lg border object-cover"
                />
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <Badge
                      variant={s.kind === "link" ? "secondary" : "outline"}
                    >
                      {s.kind}
                    </Badge>
                  </div>
                  {s.kind === "link" ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs break-all hover:underline"
                    >
                      <LinkIcon className="size-3 shrink-0" /> from {s.site}
                    </a>
                  ) : (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <ImageIcon className="size-3" /> uploaded image
                    </span>
                  )}
                </div>
              </div>
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
