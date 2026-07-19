"use client";

// PROTOTYPE — throwaway. Three radically different placements for the "paste a
// Pinterest / Myntra link" affordance inside the try-on composer. Only the
// composer's *attach source* region differs between variants; the stage above
// and the attachment grid below are shared so density reads real. Wired to
// scrapeStub (no backend). See issue #70.

import * as React from "react";
import {
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  scrapeStub,
  type ScrapeSource,
} from "@/components/aura/_proto/link-input-scrape-stub";

const MAX = 6;

/** A garment in the composer. Prototype tracks `origin` + `source` so a scraped
 * attachment can show where it came from — the real code folds this into the
 * existing `Attachment` type only if the badge survives review. */
type Attachment = {
  id: string;
  name: string;
  url: string;
  origin: "upload" | "link";
  source?: ScrapeSource;
};

let idc = 0;

function useAttachments() {
  const [attached, setAttached] = React.useState<Attachment[]>([]);
  const room = MAX - attached.length;

  function addUploads(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list).slice(0, Math.max(room, 0));
    if (!files.length) {
      toast.error(`You can attach up to ${MAX} garments`);
      return;
    }
    setAttached((prev) => [
      ...prev,
      ...files.map((f) => ({
        id: String(++idc),
        name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Garment",
        url: URL.createObjectURL(f),
        origin: "upload" as const,
      })),
    ]);
  }

  function addScraped(a: Omit<Attachment, "id" | "origin">) {
    setAttached((prev) => [
      ...prev,
      { ...a, id: String(++idc), origin: "link" as const },
    ]);
  }

  function remove(id: string) {
    setAttached((prev) => prev.filter((a) => a.id !== id));
  }

  return { attached, room, addUploads, addScraped, remove };
}

/* ---------------------------------------------- shared attachment grid ----- */

function SourceBadge({ source }: { source?: ScrapeSource }) {
  if (!source) return null;
  return (
    <span className="bg-background/90 absolute bottom-1 left-1 rounded px-1 text-[9px] font-medium capitalize">
      {source}
    </span>
  );
}

function AttachmentGrid({
  attached,
  onRemove,
  onAddClick,
  addLabel = "Add",
}: {
  attached: Attachment[];
  onRemove: (id: string) => void;
  onAddClick?: () => void;
  addLabel?: string;
}) {
  if (attached.length === 0) return null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {attached.map((g) => (
          <div key={g.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.url}
              alt={g.name}
              title={g.name}
              className="border-border size-20 rounded-lg border object-cover"
            />
            {g.origin === "link" && <SourceBadge source={g.source} />}
            <button
              type="button"
              onClick={() => onRemove(g.id)}
              aria-label={`Remove ${g.name}`}
              className="bg-background absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}
        {onAddClick && attached.length < MAX && (
          <button
            type="button"
            onClick={onAddClick}
            aria-label={addLabel}
            className="border-border text-muted-foreground hover:bg-muted grid size-20 place-items-center rounded-lg border border-dashed"
          >
            <PlusIcon className="size-5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {attached.length} piece{attached.length === 1 ? "" : "s"} · worn
          together in one result
        </span>
        <Button onClick={() => toast.success("(prototype) would generate")}>
          <SparklesIcon />
          Generate look
        </Button>
      </div>
    </div>
  );
}

/** Shared paste-a-link controller: manages the field, loading + error state,
 * and calls the stub. Each variant renders it however it likes via `children`. */
function useLinkScrape(addScraped: (a: Omit<Attachment, "id" | "origin">) => void) {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    if (busy || !url.trim()) return;
    setBusy(true);
    setError(null);
    const res = await scrapeStub(url);
    setBusy(false);
    if (res.ok) {
      addScraped({ name: res.name, url: res.image, source: res.source });
      setUrl("");
      toast.success(`Added "${res.name}" from ${res.source}`);
    } else {
      setError(res.error);
      if (res.retryable) toast.error(res.error);
    }
  }

  return { url, setUrl, busy, error, run };
}

const SOURCE_HINT = "Pinterest & Myntra";

/* ================================================================ Variant A */
/* Omni-input: one prominent bar. Link is the PRIMARY affordance; upload is a
 * secondary icon button tucked inside it. Paste a link and press enter/scrape;
 * or click the image icon to upload. */

export function VariantA() {
  const { attached, addUploads, addScraped, remove } = useAttachments();
  const { url, setUrl, busy, error, run } = useLinkScrape(addScraped);
  const fileRef = React.useRef<HTMLInputElement>(null);

  return (
    <ComposerShell subtitle="Omni-input — link-first, upload tucked inside">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addUploads(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="grid gap-1.5">
        <div
          className={cn(
            "border-input focus-within:ring-ring flex items-center gap-2 rounded-lg border px-3 py-2 focus-within:ring-2",
            error && "border-destructive",
          )}
        >
          <LinkIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) return;
            }}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Paste a Pinterest or Myntra link…"
            className="flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="…or upload an image"
            className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded"
          >
            <UploadIcon className="size-4" />
          </button>
          <Button size="sm" onClick={run} disabled={busy || !url.trim()}>
            {busy ? <Loader2Icon className="animate-spin" /> : "Add"}
          </Button>
        </div>
        {error ? (
          <p className="text-destructive text-xs">{error}</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Paste a link ({SOURCE_HINT}) or upload your own image. PNG/JPG.
          </p>
        )}
      </div>
      <AttachmentGrid attached={attached} onRemove={remove} />
    </ComposerShell>
  );
}

/* ================================================================ Variant B */
/* Segmented source picker: an explicit Upload | Paste link toggle. Selecting a
 * mode swaps the affordance below it. Clean separation, most discoverable. */

export function VariantB() {
  const { attached, addUploads, addScraped, remove } = useAttachments();
  const { url, setUrl, busy, error, run } = useLinkScrape(addScraped);
  const [mode, setMode] = React.useState<"upload" | "link">("upload");
  const fileRef = React.useRef<HTMLInputElement>(null);

  return (
    <ComposerShell subtitle="Segmented control — pick Upload or Paste link">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addUploads(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(["upload", "link"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
              mode === m
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {m === "upload" ? (
              <UploadIcon className="size-4" />
            ) : (
              <LinkIcon className="size-4" />
            )}
            {m === "upload" ? "Upload" : "Paste link"}
          </button>
        ))}
      </div>

      {mode === "upload" ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="border-border hover:bg-muted grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-6 text-center"
        >
          <UploadIcon className="text-muted-foreground size-6" />
          <span className="text-sm font-medium">Choose a garment image</span>
          <span className="text-muted-foreground text-xs">
            You supply the image. PNG/JPG.
          </span>
        </button>
      ) : (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="https://pinterest.com/pin/…  or  myntra.com/…"
              className={cn(error && "border-destructive")}
            />
            <Button onClick={run} disabled={busy || !url.trim()}>
              {busy ? <Loader2Icon className="animate-spin" /> : "Scrape"}
            </Button>
          </div>
          {error ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              Works with{" "}
              <Badge variant="secondary" className="font-normal">
                Pinterest
              </Badge>
              <Badge variant="secondary" className="font-normal">
                Myntra
              </Badge>
              product links.
            </p>
          )}
        </div>
      )}
      <AttachmentGrid attached={attached} onRemove={remove} />
    </ComposerShell>
  );
}

/* ================================================================ Variant C */
/* Two coexisting affordances: the upload drop-zone stays, and a distinct "or
 * paste a link" row sits directly beneath — both visible at once, no mode
 * switch. Attachments from either source land in the same grid. */

export function VariantC() {
  const { attached, addUploads, addScraped, remove } = useAttachments();
  const { url, setUrl, busy, error, run } = useLinkScrape(addScraped);
  const fileRef = React.useRef<HTMLInputElement>(null);

  return (
    <ComposerShell subtitle="Coexisting — drop-zone plus an always-visible link row">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addUploads(e.target.files);
          e.target.value = "";
        }}
      />
      {attached.length === 0 && (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-border hover:bg-muted grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-7 text-center"
          >
            <UploadIcon className="text-muted-foreground size-6" />
            <span className="text-sm font-medium">Upload a garment image</span>
            <span className="text-muted-foreground text-xs">PNG/JPG</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs">
              or paste a link
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
        </div>
      )}
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
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Pinterest or Myntra link"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <Button onClick={run} disabled={busy || !url.trim()}>
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
      <AttachmentGrid
        attached={attached}
        onRemove={remove}
        onAddClick={() => fileRef.current?.click()}
        addLabel="Upload another"
      />
    </ComposerShell>
  );
}

/* ---------------------------------------------------------- shared shell --- */

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
    </main>
  );
}
