"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  Link2Icon,
  Loader2Icon,
  PlusIcon,
  RotateCcwIcon,
  SparklesIcon,
  UploadIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { downscalePhoto } from "@/lib/aura";
import {
  linkGarmentName,
  toTryOnGarment,
  type Attachment,
  type GarmentSite,
  type Link,
  type Upload,
} from "@/lib/aura-provenance";
import {
  tryOnPresentation,
  type TryOnPresentation,
  type TryOnRequest,
} from "@/lib/aura-try-on-state";
import {
  MAX_TRY_ON_GARMENTS,
  PHOTO_MAX_EDGE,
  type AuraTryOnInput,
} from "@/lib/validations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The ephemeral AURA try-on surface: attach a garment image (or several worn
 * together) — from your device or a pasted Pinterest/Myntra link — generate them
 * onto the fixed AURA portrait, and view the result. Everything is in-memory and
 * cleared on reload — nothing is uploaded to storage or written to the database
 * (the try-on route returns the look inline as a data URL). The presentation for
 * the single visible stage comes from the pure {@link tryOnPresentation}; this
 * component owns the attachments, the eager link scrape, the network call, and
 * the one-active-generation guard.
 */

/** A slot reserved in the grid while a pasted link is being scraped: a shimmering
 * placeholder that holds its position (so a mixed grid never reflows) until the
 * two-hop scrape resolves into a settled {@link Link}, or is removed on error. */
type Ghost = { kind: "scraping"; id: string };

/** What the composer grid renders, in attach order: settled garments interleaved
 * with any in-flight scrape ghosts. Only the settled {@link Attachment}s are real
 * garments — ghosts occupy a slot for the shared cap but never enter a look. */
type GridItem = Attachment | Ghost;

/** The generated look, held as an inline data URL, that **owns the sources that
 * produced it** — the same {@link Attachment} objects that were composed. The
 * bundle is replaced whole by the next successful generation (its uploads'
 * object URLs revoked then) and released on unmount; displayed garment names are
 * derived from `sources`. */
type Result = { image: string; sources: Attachment[] };

/** The try-on route's success body. Only the look image is read now — displayed
 * garment names come from the retained `sources`, not the route's echo. */
type TryOnResponse = { image?: string };

type TryOnFailure = {
  code?: string;
  error?: string;
  retryable?: boolean;
};

/** The scrape route's body: a success carries a data-URI image, a name, and the
 * source; a failure carries the human-readable `error` we surface verbatim. */
type ScrapeResponse = {
  image?: string;
  name?: string;
  source?: GarmentSite;
  error?: string;
};

/** Release an upload's thumbnail object URL. Links carry a data-URI `previewUrl`
 * (nothing to revoke) and ghosts carry no image, so revocation is scoped to the
 * upload arm. */
function releasePreview(item: GridItem) {
  if (item.kind === "upload") URL.revokeObjectURL(item.previewUrl);
}

function garmentName(file: File): string {
  const withoutExtension = file.name.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.slice(0, 80) || "Garment";
}

/** Resolve a garment to the downscaled data URI the try-on request carries. Both
 * arms funnel through the same {@link downscalePhoto} at the same `PHOTO_MAX_EDGE`
 * — an upload from its `File`, a link from its already-scraped data URI — so both
 * enter the request identically sized and the try-on contract stays provenance-free. */
function garmentImage(source: Attachment): Promise<string> {
  const image = source.kind === "link" ? source.scrapedImage : source.file;
  return downscalePhoto(image, PHOTO_MAX_EDGE);
}

/** The 2px ring hue that marks a settled link tile by its source. Uploads stay
 * unringed; the tile size is identical for both. */
const SITE_RING: Record<GarmentSite, string> = {
  pinterest: "ring-[#e60023]",
  myntra: "ring-[#ff3f6c]",
};

/** The shared over-cap toast — one message and threshold for both entry points
 * (upload and link), so the piece-limit copy can't drift between them. */
function capReachedToast(description: string) {
  toast.error(`You can attach up to ${MAX_TRY_ON_GARMENTS} garments`, {
    description,
  });
}

export function TryOnSurface() {
  const router = useRouter();
  const idRef = React.useRef(0);
  // A monotonic per-link ordinal, so several title-less garments from the same
  // host stay distinguishable ("myntra.com 1", "myntra.com 2").
  const linkOrdinalRef = React.useRef(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // The last set of garments a generation was attempted with, so a retry can
  // re-run the same look even after the composer has been edited.
  const lastAttempt = React.useRef<Attachment[]>([]);

  const [items, setItems] = React.useState<GridItem[]>([]);
  const [linkValue, setLinkValue] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "generating" | "retryable-failure" | "refused"
  >("idle");

  // The settled garments (ghosts excluded) — the real composer contents that a
  // generation runs on and the piece count reflects.
  const attached = items.filter(
    (item): item is Attachment => item.kind !== "scraping",
  );
  const isScraping = items.some((item) => item.kind === "scraping");

  // Revoke every live upload object URL when the surface unmounts (navigation
  // away) — both the staging grid and the retained result bundle. The refs are
  // synced in an effect (never during render) so the unmount cleanup sees the
  // latest values without re-subscribing on every change.
  const itemsRef = React.useRef(items);
  const resultRef = React.useRef(result);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  React.useEffect(() => {
    resultRef.current = result;
  }, [result]);
  React.useEffect(
    () => () => {
      for (const item of itemsRef.current) releasePreview(item);
      for (const item of resultRef.current?.sources ?? []) releasePreview(item);
    },
    [],
  );

  const request: TryOnRequest =
    phase === "generating"
      ? "generating"
      : phase === "retryable-failure"
        ? "retryable-failure"
        : phase === "refused"
          ? "refused"
          : attached.length > 0
            ? "composing"
            : "idle";

  const presentation = tryOnPresentation({ resultUrl: result?.image, request });
  const isGenerating = presentation.pending;

  function openPicker() {
    fileRef.current?.click();
  }

  function onFiles(list: FileList | null) {
    if (!list?.length) return;
    // The cap is shared and kind-agnostic: uploads and (scraping or settled)
    // links compete for the same slots.
    const room = MAX_TRY_ON_GARMENTS - items.length;
    const files = Array.from(list);
    if (files.length > room) {
      capReachedToast("Remove a piece before adding more.");
    }
    const added: Upload[] = files.slice(0, Math.max(room, 0)).map((file) => ({
      kind: "upload",
      id: String(++idRef.current),
      name: garmentName(file),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    if (added.length) setItems((prev) => [...prev, ...added]);
  }

  /** Remove a grid item by id (a settled garment via its ✕, or a ghost when its
   * scrape fails), releasing an upload's object URL. */
  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) releasePreview(target);
      return prev.filter((item) => item.id !== id);
    });
  }

  /** Eager scrape at attach: a pasted link fires `POST /api/aura/scrape` right
   * away. The shared cap is checked *before* firing, so an over-cap link never
   * triggers the two-hop fetch. A ghost tile reserves the slot immediately and is
   * replaced in place by the settled link, or removed on any error (→ toast). */
  async function addLink() {
    const url = linkValue.trim();
    if (!url || isGenerating) return;

    if (items.length >= MAX_TRY_ON_GARMENTS) {
      capReachedToast("Remove a piece before adding a link.");
      return;
    }

    const ghostId = String(++idRef.current);
    const ordinal = ++linkOrdinalRef.current;
    setItems((prev) => [...prev, { kind: "scraping", id: ghostId }]);
    // Clear the field up front so the participant can queue another link while
    // this one scrapes; on error there is nothing left to clear.
    setLinkValue("");

    let response: Response;
    try {
      response = await fetch("/api/aura/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      removeItem(ghostId);
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    const body = (await response
      .json()
      .catch(() => null)) as ScrapeResponse | null;

    if (!response.ok || !body?.image || !body.source) {
      // Every scrape error surfaces as a toast, nothing is added, and the ghost
      // tile is removed. The route's own message is preserved verbatim.
      removeItem(ghostId);
      toast.error(body?.error ?? "We couldn't use that link", {
        description: "Nothing was added. Please try another link.",
      });
      return;
    }

    // A complete Link, as shape-complete as an upload: the scraped data URI is
    // both the retained bytes and the thumbnail; the pasted url/site are the
    // provenance carried through to a future save.
    const link: Link = {
      kind: "link",
      id: ghostId,
      name: linkGarmentName(body.name, url, ordinal),
      scrapedImage: body.image,
      previewUrl: body.image,
      sourceUrl: url,
      site: body.source,
    };
    setItems((prev) => prev.map((item) => (item.id === ghostId ? link : item)));
  }

  async function generate(from: Attachment[]) {
    // One active generation at a time: the guard is the whole backpressure
    // story, since nothing about the try-on persists to claim in-flight state.
    if (from.length === 0 || isGenerating) return;

    lastAttempt.current = from;
    setPhase("generating");

    let garments: AuraTryOnInput["garments"];
    try {
      const images = await Promise.all(from.map(garmentImage));
      garments = from.map((item, i) => toTryOnGarment(item, images[i]));
    } catch {
      setPhase("retryable-failure");
      toast.error("We couldn't read one of those garment images", {
        description: "Try re-exporting it, then attach it again.",
      });
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/aura/try-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garments }),
      });
    } catch {
      setPhase("retryable-failure");
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    const body = (await response.json().catch(() => null)) as
      | (TryOnResponse & TryOnFailure)
      | null;

    if (!response.ok || !body?.image) {
      const failure = body as TryOnFailure | null;
      // A portrait that vanished between page load and generation resolves the
      // same way the page guard does: route to profile creation.
      if (failure?.code === "no-portrait") {
        toast.error("Create your AURA portrait first", {
          description: "Redirecting you to your profile.",
        });
        router.push("/aura");
        return;
      }
      // Non-retryable failures resolve by swapping the garment, not by retrying
      // the same one: an explicit `refused`/`invalid-garment` kind, any envelope
      // the route marks non-retryable, or a deterministic 400 (the encoded body
      // failed the shared schema — the same file will fail again). Only the
      // genuinely retryable kinds (timeout/transient) keep the pieces for retry.
      const differentGarment =
        failure?.code === "try-on-refused" ||
        failure?.code === "invalid-garment" ||
        response.status === 400 ||
        failure?.retryable === false;
      setPhase(differentGarment ? "refused" : "retryable-failure");
      toast.error("That try-on didn't come through", {
        description: failure?.error ?? "Nothing was saved. Please try again.",
      });
      return;
    }

    // The generated look owns the sources that produced it. The previous
    // bundle is replaced whole — its uploads' object URLs are revoked *now*,
    // since nothing references them anymore.
    const image = body.image;
    setResult((prev) => {
      if (prev) for (const item of prev.sources) releasePreview(item);
      return { image, sources: from };
    });
    // The staging grid resets for the next look, but the pieces it held did
    // *not* have their bytes discarded — they live on in the result's sources,
    // so only staging items that never made it into the look are released.
    const retained = new Set(from.map((item) => item.id));
    setItems((prev) => {
      for (const item of prev) if (!retained.has(item.id)) releasePreview(item);
      return [];
    });
    setPhase("idle");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 grid gap-2 border-b pb-6">
        <h1 className="text-3xl font-medium tracking-tight text-balance">
          Try on a look
        </h1>
        <p className="text-muted-foreground text-pretty">
          Attach a garment image and see it worn on your AURA portrait. Nothing
          is uploaded or saved — your try-ons stay in this session.
        </p>
      </header>

      {/* ---- Stage: exactly one of empty / generating / failed / result ---- */}
      <section className="grid gap-3">
        {isGenerating && presentation.image === "result" && result ? (
          <ResultStage result={result} pending presentation={presentation} />
        ) : isGenerating ? (
          <GeneratingStage presentation={presentation} />
        ) : phase === "retryable-failure" || phase === "refused" ? (
          <FailedStage
            presentation={presentation}
            onRetry={() => generate(lastAttempt.current)}
            onAttachDifferent={openPicker}
          />
        ) : result ? (
          <ResultStage result={result} presentation={presentation} />
        ) : (
          <EmptyStage presentation={presentation} onAttach={openPicker} />
        )}
      </section>

      {/* ---- Composer: attach garment image(s) and/or paste a link ---- */}
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

        {items.length === 0 ? (
          <button
            type="button"
            onClick={openPicker}
            className="border-border hover:bg-muted grid place-items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors"
          >
            <UploadIcon className="text-muted-foreground size-6" />
            <span className="text-sm font-medium">Choose a garment image</span>
            <span className="text-muted-foreground text-xs">
              You supply the image — this isn&rsquo;t a catalog. PNG/JPG.
            </span>
          </button>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {items.map((item) =>
                item.kind === "scraping" ? (
                  <GhostTile key={item.id} />
                ) : (
                  <div key={item.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className={cn(
                        "border-border size-20 rounded-lg border object-cover",
                        item.kind === "link" &&
                          `ring-2 ${SITE_RING[item.site]}`,
                      )}
                    />
                    {item.kind === "link" && (
                      <span
                        aria-hidden
                        className="bg-background text-foreground absolute -bottom-1.5 -left-1.5 grid size-5 place-items-center rounded-full border"
                      >
                        <Link2Icon className="size-3" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                      disabled={isGenerating}
                      className="bg-background absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border disabled:opacity-50"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ),
              )}
              {items.length < MAX_TRY_ON_GARMENTS && (
                <button
                  type="button"
                  onClick={openPicker}
                  aria-label="Add another garment"
                  disabled={isGenerating}
                  className="border-border text-muted-foreground hover:bg-muted grid size-20 place-items-center rounded-lg border border-dashed disabled:opacity-50"
                >
                  <PlusIcon className="size-5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs">
                {attached.length} piece{attached.length === 1 ? "" : "s"}
                {isScraping ? " · a link is still scraping" : ""} · worn together
                in one result
              </span>
              <Button
                onClick={() => generate(attached)}
                disabled={isGenerating || isScraping || attached.length === 0}
              >
                <SparklesIcon />
                {isGenerating ? "Generating…" : "Generate look"}
              </Button>
            </div>
          </div>
        )}

        {/* ---- Divider + always-visible link row (Variant C) ---- */}
        <div className="flex items-center gap-3 py-1">
          <div className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs">or paste a link</span>
          <div className="bg-border h-px flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Link2Icon className="text-muted-foreground size-4 shrink-0" />
          <Input
            type="url"
            inputMode="url"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addLink();
              }
            }}
            placeholder="Pinterest or Myntra link"
            aria-label="Pinterest or Myntra link"
            disabled={isGenerating}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void addLink()}
            disabled={isGenerating || linkValue.trim() === ""}
          >
            Add link
          </Button>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------- tiles ------ */

/** The shimmering placeholder that reserves a garment's slot while its link is
 * scraped, so a mixed grid never reflows when the settled tile lands. */
function GhostTile() {
  return (
    <div
      role="status"
      aria-label="Scraping link"
      className="border-border relative size-20 overflow-hidden rounded-lg border"
    >
      <Skeleton className="absolute inset-0" />
      <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-1">
        <Loader2Icon className="size-5 animate-spin motion-reduce:animate-none" />
        <span className="text-[10px]">scraping…</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- stages ----- */

const STAGE_ACTION_ICON: Record<
  NonNullable<TryOnPresentation["primaryAction"]>,
  LucideIcon
> = {
  attach: UploadIcon,
  generate: SparklesIcon,
  retry: RotateCcwIcon,
  "attach-different-garment": UploadIcon,
};

const STAGE_ACTION_LABEL: Record<
  NonNullable<TryOnPresentation["primaryAction"]>,
  string
> = {
  attach: "Attach a garment",
  generate: "Generate look",
  retry: "Try again",
  "attach-different-garment": "Attach a different garment",
};

function EmptyStage({
  presentation,
  onAttach,
}: {
  presentation: TryOnPresentation;
  onAttach: () => void;
}) {
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
        <h2 className="text-lg font-medium">{presentation.title}</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {presentation.description}
        </p>
        {/* Generating is owned by the composer button; the stage only offers the
            "attach" entry point when there is nothing attached yet. */}
        {presentation.primaryAction === "attach" && (
          <Button onClick={onAttach}>
            <UploadIcon />
            {STAGE_ACTION_LABEL.attach}
          </Button>
        )}
      </div>
    </div>
  );
}

function GeneratingStage({
  presentation,
}: {
  presentation: TryOnPresentation;
}) {
  return (
    <div
      className="relative min-h-96 overflow-hidden rounded-xl border"
      aria-busy
    >
      <Skeleton className="absolute inset-0" />
      <PendingOverlay presentation={presentation} className="absolute inset-0" />
    </div>
  );
}

/** The indeterminate "putting the look together" status, shared by the fresh
 * generating stage and the regenerate overlay laid over an existing result. */
function PendingOverlay({
  presentation,
  className,
}: {
  presentation: TryOnPresentation;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("grid place-items-center p-6 text-center", className)}
    >
      <div className="grid justify-items-center gap-3">
        <SparklesIcon className="text-primary size-9 animate-pulse motion-reduce:animate-none" />
        <p className="font-medium">{presentation.title}</p>
        <p className="text-muted-foreground text-sm">
          {presentation.description}
        </p>
      </div>
    </div>
  );
}

function FailedStage({
  presentation,
  onRetry,
  onAttachDifferent,
}: {
  presentation: TryOnPresentation;
  onRetry: () => void;
  onAttachDifferent: () => void;
}) {
  const action = presentation.primaryAction;
  const Icon = action ? STAGE_ACTION_ICON[action] : AlertCircleIcon;
  const run = action === "attach-different-garment" ? onAttachDifferent : onRetry;
  return (
    <div
      role="alert"
      className="border-destructive/50 bg-destructive/5 grid min-h-72 place-items-center rounded-xl border p-6 text-center"
    >
      <div className="grid max-w-sm justify-items-center gap-3">
        <AlertCircleIcon className="text-destructive size-9" />
        <h2 className="font-medium">{presentation.title}</h2>
        <p className="text-muted-foreground text-sm text-pretty">
          {presentation.description}
        </p>
        {action && (
          <Button variant="outline" onClick={run}>
            <Icon />
            {STAGE_ACTION_LABEL[action]}
          </Button>
        )}
      </div>
    </div>
  );
}

function ResultStage({
  result,
  presentation,
  pending = false,
}: {
  result: Result;
  presentation: TryOnPresentation;
  pending?: boolean;
}) {
  const caption = result.sources.map((source) => source.name).join(" + ");
  return (
    <figure className="grid gap-2" aria-busy={pending || undefined}>
      <div className="bg-muted/30 relative grid place-items-center overflow-hidden rounded-xl border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.image}
          alt={`Your AURA portrait wearing ${caption}`}
          className={cn(
            "max-h-[70vh] w-auto max-w-full rounded-md object-contain",
            pending && "opacity-40",
          )}
        />
        {pending && (
          <PendingOverlay
            presentation={presentation}
            className="bg-background/70 absolute inset-0 backdrop-blur-sm"
          />
        )}
      </div>
      <figcaption className="text-muted-foreground text-xs">{caption}</figcaption>
    </figure>
  );
}

function PortraitTile({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted relative grid place-items-center overflow-hidden rounded-lg border",
        className,
      )}
    >
      <div className="bg-secondary absolute inset-x-0 top-0 h-1/2" />
      <div className="z-10 grid justify-items-center gap-2 p-4 text-center">
        <UserRoundIcon
          className="text-muted-foreground size-10"
          strokeWidth={1.25}
        />
        <span className="text-muted-foreground font-geist-mono text-[10px] tracking-widest uppercase">
          Your AURA portrait
        </span>
      </div>
    </div>
  );
}
