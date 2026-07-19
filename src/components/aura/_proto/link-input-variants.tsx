"use client";

// PROTOTYPE — throwaway. Issue #85: adapt the already-chosen "Variant C" link
// row (closed ticket #70 — keep the upload drop-zone, add an always-visible
// "or paste a link" row) to #82's tagged-union garment model. The composer
// SHELL is held constant across all three; what differs is the answer to #85's
// three still-open questions:
//
//   1. the transient "scraping…" tile (#82's eager scrape-at-attach) — where it
//      lives and what it looks like while the two-hop fetch is in flight;
//   2. how a settled *scraped* tile is marked as a link (vs an upload);
//   3. where a scrape error surfaces — inline vs toast (#70 said inline for
//      non-retryable; #82 leaned toast — this is exactly what #85 must settle).
//
// Wired to scrapeStub (no backend). Only the composer's attach-source region is
// under evaluation; the stage above is a low-fidelity placeholder for density.

import * as React from "react";
import {
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  scrapeStub,
  type ScrapeSource,
} from "@/components/aura/_proto/link-input-scrape-stub";

const MAX = 6;
const SOURCE_HINT = "Pinterest & Myntra";
const SOURCE_COLOR: Record<ScrapeSource, string> = {
  pinterest: "#e60023",
  myntra: "#ff3f6c",
};

/* ------------------------------------------------------------ state model -- */
// #82's tagged union, plus a `pending` arm for the transient scraping tile.
// The real code infers `kind` at the save boundary; the prototype keeps it
// explicit so illegal mixes are impossible and the badge has something to read.

type Upload = { kind: "upload"; id: string; name: string; previewUrl: string };
type Link = {
  kind: "link";
  id: string;
  name: string;
  previewUrl: string;
  sourceUrl: string;
  source: ScrapeSource;
};
type Pending = {
  kind: "pending";
  id: string;
  source: ScrapeSource;
  sourceUrl: string;
};
type Slot = Upload | Link | Pending;

let idc = 0;
const nextId = () => String(++idc);

/** Client-side host detection so the pending tile can name its source the
 * instant the link is added, before the two-hop scrape resolves. Mirrors the
 * real route's allowlist hosts. */
function detectSource(url: string): ScrapeSource | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "pinterest.com" || host.endsWith(".pinterest.com"))
      return "pinterest";
    if (host === "myntra.com" || host === "www.myntra.com") return "myntra";
    return null;
  } catch {
    return null;
  }
}

/** The whole composer: heterogeneous slots in attach order, one shared cap. */
function useComposer() {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const count = slots.length;
  const room = MAX - count;

  function addUploads(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(room, 0));
    if (!files.length) {
      toast.error(`You can attach up to ${MAX} garments`);
      return;
    }
    setSlots((prev) => [
      ...prev,
      ...files.map<Upload>((f) => ({
        kind: "upload",
        id: nextId(),
        name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Garment",
        previewUrl: URL.createObjectURL(f),
      })),
    ]);
  }

  function remove(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  /** Eager scrape-at-attach (#82): reserve a pending slot up front, fetch, then
   * replace it with a settled Link — or drop it and report the error. Returns
   * the ScrapeResult so each variant can place the error where it wants. */
  async function addLink(
    rawUrl: string,
    onError: (message: string, retryable: boolean) => void,
  ) {
    const url = rawUrl.trim();
    const source = detectSource(url);
    if (!source) {
      onError("Only Pinterest and Myntra links are supported.", false);
      return;
    }
    if (room <= 0) {
      onError(`You can attach up to ${MAX} garments`, false);
      return;
    }
    const pendingId = nextId();
    setSlots((prev) => [
      ...prev,
      { kind: "pending", id: pendingId, source, sourceUrl: url },
    ]);
    const res = await scrapeStub(url);
    if (res.ok) {
      setSlots((prev) =>
        prev.map((s) =>
          s.id === pendingId
            ? {
                kind: "link",
                id: pendingId,
                name: res.name,
                previewUrl: res.image,
                sourceUrl: url,
                source: res.source,
              }
            : s,
        ),
      );
      toast.success(`Added “${res.name}” from ${res.source}`);
    } else {
      setSlots((prev) => prev.filter((s) => s.id !== pendingId));
      onError(res.error, res.retryable);
    }
  }

  return { slots, count, room, addUploads, addLink, remove };
}

/* ------------------------------------------------------------ shared bits -- */

function RemoveButton({ onClick, name }: { onClick: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${name}`}
      className="bg-background absolute -top-2 -right-2 z-10 grid size-5 place-items-center rounded-full border"
    >
      <XIcon className="size-3" />
    </button>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Upload another garment"
      className="border-border text-muted-foreground hover:bg-muted grid size-20 place-items-center rounded-lg border border-dashed"
    >
      <PlusIcon className="size-5" />
    </button>
  );
}

function GenerateRow({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-muted-foreground text-xs">
        {count} piece{count === 1 ? "" : "s"} · worn together in one result
      </span>
      <Button onClick={() => toast.success("(prototype) would generate")}>
        <SparklesIcon />
        Generate look
      </Button>
    </div>
  );
}

/** The empty-state drop-zone + "or paste a link" divider, shown only before the
 * first garment lands — identical structure to #70's Variant C. */
function DropZone({ onPick }: { onPick: () => void }) {
  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={onPick}
        className="border-border hover:bg-muted grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-7 text-center"
      >
        <UploadIcon className="text-muted-foreground size-6" />
        <span className="text-sm font-medium">Upload a garment image</span>
        <span className="text-muted-foreground text-xs">PNG/JPG</span>
      </button>
      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">or paste a link</span>
        <span className="bg-border h-px flex-1" />
      </div>
    </div>
  );
}

/** The always-visible link row. `error` renders inline when a variant chooses
 * to; pass `error={null}` for a toast-only variant. */
function LinkRow({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (url: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [url, setUrl] = React.useState("");
  function submit() {
    if (!url.trim()) return;
    onSubmit(url);
    setUrl("");
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <div
          className={cn(
            "border-input focus-within:ring-ring flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 focus-within:ring-2",
            error && "border-destructive",
          )}
        >
          <LinkIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Pinterest or Myntra link"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <Button onClick={submit} disabled={busy || !url.trim()}>
          {busy ? <Loader2Icon className="animate-spin" /> : "Add link"}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          We pull the garment image straight from the {SOURCE_HINT} page.
        </p>
      )}
    </div>
  );
}

function SourceDot({ source }: { source: ScrapeSource }) {
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ backgroundColor: SOURCE_COLOR[source] }}
      aria-hidden
    />
  );
}

/* ================================================================ Variant A */
/* Ghost tile + corner badge + inline errors.
 * Scraping shows as a shimmering ghost tile IN the grid (eager, in place).
 * A settled scraped tile carries a small pill badge in the top-left corner
 * (dot + source word). Every scrape error renders inline under the field. */

export function VariantA() {
  const { slots, count, room, addUploads, addLink, remove } = useComposer();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pick = () => fileRef.current?.click();

  async function submit(url: string) {
    setBusy(true);
    setError(null);
    await addLink(url, (message) => setError(message)); // inline, always
    setBusy(false);
  }

  return (
    <ComposerShell subtitle="A · ghost tile + corner badge · inline errors">
      <HiddenFileInput ref={fileRef} onFiles={addUploads} />
      {count === 0 && <DropZone onPick={pick} />}
      <LinkRow onSubmit={submit} busy={busy} error={error} />
      {count > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {slots.map((s) =>
              s.kind === "pending" ? (
                <div
                  key={s.id}
                  className="border-border bg-muted relative grid size-20 animate-pulse place-items-center gap-1 rounded-lg border"
                >
                  <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                  <span className="text-muted-foreground text-[9px]">
                    scraping…
                  </span>
                </div>
              ) : (
                <div key={s.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.previewUrl}
                    alt={s.name}
                    title={s.name}
                    className="border-border size-20 rounded-lg border object-cover"
                  />
                  {s.kind === "link" && (
                    <span className="bg-background/90 absolute top-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium capitalize shadow-sm">
                      <SourceDot source={s.source} />
                      {s.source}
                    </span>
                  )}
                  <RemoveButton onClick={() => remove(s.id)} name={s.name} />
                </div>
              ),
            )}
            {room > 0 && <AddTile onClick={pick} />}
          </div>
          <GenerateRow count={count} />
        </div>
      )}
    </ComposerShell>
  );
}

/* ================================================================ Variant B */
/* Brand progress tile + footer label bar + toast errors.
 * Scraping shows as a tile tinted in the source's brand colour with a progress
 * caption ("Fetching from Myntra…"). A settled scraped tile gets a full-width
 * footer label bar under the thumbnail (icon + name) — uploads have none, so
 * links read as clearly different at a glance. Errors are toast-only (#82). */

export function VariantB() {
  const { slots, count, room, addUploads, addLink, remove } = useComposer();
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pick = () => fileRef.current?.click();

  async function submit(url: string) {
    setBusy(true);
    await addLink(url, (message) => toast.error(message)); // toast, always
    setBusy(false);
  }

  return (
    <ComposerShell subtitle="B · brand progress tile + footer label · toast errors">
      <HiddenFileInput ref={fileRef} onFiles={addUploads} />
      {count === 0 && <DropZone onPick={pick} />}
      <LinkRow onSubmit={submit} busy={busy} error={null} />
      {count > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {slots.map((s) =>
              s.kind === "pending" ? (
                <div
                  key={s.id}
                  className="relative grid h-28 w-20 place-items-center gap-1 overflow-hidden rounded-lg border text-center"
                  style={{
                    borderColor: SOURCE_COLOR[s.source],
                    backgroundColor: `${SOURCE_COLOR[s.source]}14`,
                  }}
                >
                  <Loader2Icon
                    className="size-4 animate-spin"
                    style={{ color: SOURCE_COLOR[s.source] }}
                  />
                  <span
                    className="px-1 text-[9px] font-medium capitalize"
                    style={{ color: SOURCE_COLOR[s.source] }}
                  >
                    Fetching from {s.source}…
                  </span>
                </div>
              ) : (
                <div key={s.id} className="relative">
                  <div className="border-border h-28 w-20 overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.previewUrl}
                      alt={s.name}
                      title={s.name}
                      className="size-20 object-cover"
                    />
                    {s.kind === "link" ? (
                      <div
                        className="flex h-8 items-center gap-1 px-1.5 text-[9px] font-medium text-white"
                        style={{ backgroundColor: SOURCE_COLOR[s.source] }}
                      >
                        <LinkIcon className="size-3 shrink-0" />
                        <span className="truncate capitalize">{s.source}</span>
                      </div>
                    ) : (
                      <div className="text-muted-foreground bg-muted flex h-8 items-center gap-1 px-1.5 text-[9px] font-medium">
                        <ImageIcon className="size-3 shrink-0" />
                        <span className="truncate">Upload</span>
                      </div>
                    )}
                  </div>
                  <RemoveButton onClick={() => remove(s.id)} name={s.name} />
                </div>
              ),
            )}
            {room > 0 && (
              <button
                type="button"
                onClick={pick}
                aria-label="Upload another garment"
                className="border-border text-muted-foreground hover:bg-muted grid h-28 w-20 place-items-center rounded-lg border border-dashed"
              >
                <PlusIcon className="size-5" />
              </button>
            )}
          </div>
          <GenerateRow count={count} />
        </div>
      )}
    </ComposerShell>
  );
}

/* ================================================================ Variant C */
/* Pending chip below the field + tinted-ring badge + hybrid errors.
 * Scraping is NOT a grid tile — a pending chip sits under the link field, so
 * the grid only ever holds settled garments. A settled scraped tile is marked
 * by a coloured ring in the source hue plus an icon-only corner chip (no text).
 * Errors follow #70's mapping: non-retryable inline, retryable also toast. */

export function VariantC() {
  const { slots, count, room, addUploads, addLink, remove } = useComposer();
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pick = () => fileRef.current?.click();

  const pendings = slots.filter((s): s is Pending => s.kind === "pending");
  const settled = slots.filter(
    (s): s is Upload | Link => s.kind !== "pending",
  );

  async function submit(url: string) {
    setError(null);
    await addLink(url, (message, retryable) => {
      setError(message);
      if (retryable) toast.error(message);
    });
  }

  return (
    <ComposerShell subtitle="C · pending chip outside grid + ring badge · hybrid errors">
      <HiddenFileInput ref={fileRef} onFiles={addUploads} />
      {count === 0 && <DropZone onPick={pick} />}
      <LinkRow onSubmit={submit} busy={false} error={error} />
      {pendings.length > 0 && (
        <div className="grid gap-1.5">
          {pendings.map((p) => (
            <div
              key={p.id}
              className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs"
            >
              <Loader2Icon className="size-3.5 animate-spin" />
              <span className="capitalize">scraping {p.source}…</span>
              <span className="text-muted-foreground/70 flex-1 truncate">
                {p.sourceUrl}
              </span>
            </div>
          ))}
        </div>
      )}
      {settled.length > 0 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            {settled.map((s) => (
              <div key={s.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.previewUrl}
                  alt={s.name}
                  title={s.name}
                  className={cn(
                    "size-20 rounded-lg border object-cover",
                    s.kind === "link" ? "border-2" : "border-border",
                  )}
                  style={
                    s.kind === "link"
                      ? { borderColor: SOURCE_COLOR[s.source] }
                      : undefined
                  }
                />
                {s.kind === "link" && (
                  <span
                    className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full text-white shadow-sm"
                    style={{ backgroundColor: SOURCE_COLOR[s.source] }}
                    title={`From ${s.source}`}
                  >
                    <LinkIcon className="size-2.5" />
                  </span>
                )}
                <RemoveButton onClick={() => remove(s.id)} name={s.name} />
              </div>
            ))}
            {room > 0 && <AddTile onClick={pick} />}
          </div>
          <GenerateRow count={count} />
        </div>
      )}
    </ComposerShell>
  );
}

/* ---------------------------------------------------------- shared shell --- */

const HiddenFileInput = React.forwardRef<
  HTMLInputElement,
  { onFiles: (list: FileList | null) => void }
>(function HiddenFileInput({ onFiles }, ref) {
  return (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={(e) => {
        onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );
});

function ComposerShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 grid gap-2 border-b pb-6">
        <h1 className="text-3xl font-medium tracking-tight text-balance">
          Try on a look
        </h1>
        <p className="text-muted-foreground text-pretty">
          Attach a garment — upload an image or paste a link — and see it worn on
          your AURA portrait. Nothing is uploaded or saved.
        </p>
      </header>

      {/* stage placeholder for density */}
      <section className="grid place-items-center rounded-xl border border-dashed py-14 text-center">
        <p className="text-muted-foreground max-w-sm px-6 text-sm">
          Your generated look appears here. (Prototype stage — the composer below
          is what&rsquo;s being evaluated.)
        </p>
      </section>

      <section className="mt-8 grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Attach a garment</h2>
          <Badge variant="secondary">{subtitle}</Badge>
        </div>
        {children}
      </section>

      {/* prototype cheat-sheet */}
      <p className="text-muted-foreground mx-auto mt-6 max-w-md text-center text-xs">
        Try: a pinterest.com or myntra.com URL (succeeds) · a link containing{" "}
        <code>fail</code>, <code>noimage</code>, or <code>big</code> (errors) · a
        non-supported host (unsupported-domain). Uploads work too — mix freely up
        to {MAX}.
      </p>
    </main>
  );
}
