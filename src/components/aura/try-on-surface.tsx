"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
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
import { STYLE_BOOK_HREF, type SaveState } from "@/lib/aura-save-state";
import {
  rawImageOf,
  toSaveSource,
  toTryOnGarment,
  type Attachment,
  type SaveSource,
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
import { SaveBar } from "@/components/aura/save-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The ephemeral AURA try-on surface: attach a garment image (or several worn
 * together), generate it onto the fixed AURA portrait, and view the result.
 * Everything is in-memory and cleared on reload — nothing is uploaded to
 * storage or written to the database (the route returns the look inline as a
 * data URL). The presentation for the single visible stage comes from the pure
 * {@link tryOnPresentation}; this component only owns the attachments, the
 * network call, and the one-active-generation guard.
 */

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

/** Release an upload's thumbnail object URL. Links carry a data-URI `previewUrl`
 * (nothing to revoke), so revocation is scoped to the upload arm. */
function releasePreview(source: Attachment) {
  if (source.kind === "upload") URL.revokeObjectURL(source.previewUrl);
}

function garmentName(file: File): string {
  const withoutExtension = file.name.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.slice(0, 80) || "Garment";
}

/** Resolve a garment to the downscaled data URI the try-on request carries. The
 * composer builds only uploads today; the link arm (downscaling the scraped
 * data URI to the same edge) lands with the link UI in #4. */
function garmentImage(source: Attachment): Promise<string> {
  if (source.kind === "link") {
    throw new Error("Link garments are not wired into the composer yet");
  }
  return downscalePhoto(source.file, PHOTO_MAX_EDGE);
}

/** Re-encode/downscale a source's image to the same edge at save time — both
 * arms — so the `Attachment` (the `File` / scraped data URI) stays the single
 * source of truth and a full-res scraped image never ships in the payload. */
function saveSourceImage(source: Attachment): Promise<string> {
  return downscalePhoto(rawImageOf(source), PHOTO_MAX_EDGE);
}

/** The style-book route's `201` body (the fields the toast reads). */
type StyleBookSaveResponse = { caption?: string };

/** A route failure envelope, mirroring the try-on route's shape. */
type StyleBookFailure = { error?: string };

export function TryOnSurface() {
  const router = useRouter();
  const idRef = React.useRef(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // The last set of attachments a generation was attempted with, so a retry can
  // re-run the same look even after the composer has been edited.
  const lastAttempt = React.useRef<Attachment[]>([]);

  const [attached, setAttached] = React.useState<Attachment[]>([]);
  const [result, setResult] = React.useState<Result | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "generating" | "retryable-failure" | "refused"
  >("idle");
  // The save bar's lifecycle for the *current* result. Reset to idle whenever a
  // new look is generated (the effect below keyed on `result`), so a fresh look
  // is always saveable — even after the previous one reached terminal "Saved".
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  // Client-only in-flight guard: dedupes a double-click before React has
  // re-rendered the disabled button. No server-side dedup in v1.
  const savingRef = React.useRef(false);

  // Revoke every live upload object URL when the surface unmounts (navigation
  // away) — both the staging composer and the retained result bundle. The refs
  // are synced in an effect (never during render) so the unmount cleanup sees
  // the latest values without re-subscribing on every change.
  const attachedRef = React.useRef(attached);
  const resultRef = React.useRef(result);
  React.useEffect(() => {
    attachedRef.current = attached;
  }, [attached]);
  React.useEffect(() => {
    resultRef.current = result;
  }, [result]);
  React.useEffect(
    () => () => {
      for (const item of attachedRef.current) releasePreview(item);
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
    const room = MAX_TRY_ON_GARMENTS - attached.length;
    const files = Array.from(list);
    if (files.length > room) {
      toast.error(`You can attach up to ${MAX_TRY_ON_GARMENTS} garments`, {
        description: "Remove a piece before adding more.",
      });
    }
    const added: Upload[] = files.slice(0, Math.max(room, 0)).map((file) => ({
      kind: "upload",
      id: String(++idRef.current),
      name: garmentName(file),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    if (added.length) setAttached((prev) => [...prev, ...added]);
  }

  function removeAttachment(id: string) {
    setAttached((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) releasePreview(target);
      return prev.filter((item) => item.id !== id);
    });
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
    // A fresh look is saveable from scratch: "Generate again" resets the save
    // bar to idle, dropping any terminal "Saved" from the look it replaced.
    savingRef.current = false;
    setSaveState("idle");
    // The staging composer resets for the next look, but the pieces it held did
    // *not* have their bytes discarded — they live on in the result's sources,
    // so only staging items that never made it into the look are released.
    const retained = new Set(from.map((item) => item.id));
    setAttached((prev) => {
      for (const item of prev) if (!retained.has(item.id)) releasePreview(item);
      return [];
    });
    setPhase("idle");
  }

  async function saveLook(look: Result) {
    // Only a settled, idle result is saveable, and only one save runs at a time.
    // The ref closes the double-click window the `saving` state alone can't
    // (both clicks fire before the disabled re-render lands).
    if (savingRef.current || saveState !== "idle") return;
    savingRef.current = true;
    setSaveState("saving");

    // Every failure returns the bar to idle/retryable with an error toast — only
    // a confirmed 2xx below reaches terminal "Saved".
    const failSave = (title: string, description: string) => {
      savingRef.current = false;
      setSaveState("idle");
      toast.error(title, { description });
    };

    // Project the retained sources to the per-source save shape, re-encoding
    // every image to `PHOTO_MAX_EDGE` on both arms first (a one-time browser
    // cost shadowed by the Cloudinary uploads this same save triggers).
    let sources: SaveSource[];
    try {
      const images = await Promise.all(look.sources.map(saveSourceImage));
      sources = look.sources.map((source, i) => toSaveSource(source, images[i]));
    } catch {
      failSave("We couldn't prepare your look to save", "Please try again.");
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/aura/style-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ look: look.image, sources }),
      });
    } catch {
      failSave(
        "Couldn't reach the server",
        "Check your connection and try again.",
      );
      return;
    }

    // Only a confirmed 2xx reaches the terminal "Saved" state; every other
    // outcome returns the bar to idle/retryable with an error toast.
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as
        | StyleBookFailure
        | null;
      failSave(
        "We couldn't save your look",
        failure?.error ?? "Nothing was saved. Please try again.",
      );
      return;
    }

    const saved = (await response.json().catch(() => null)) as
      | StyleBookSaveResponse
      | null;
    savingRef.current = false;
    setSaveState("saved");
    toast.success("Saved to your Style Book", {
      description: saved?.caption,
      action: {
        label: "View",
        onClick: () => router.push(STYLE_BOOK_HREF),
      },
    });
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
          <>
            <ResultStage result={result} presentation={presentation} />
            {/* Wide save bar directly under the result image. `busy` folds in
                any composer work-in-progress — an in-flight generation today,
                and the in-flight scrape once the link input lands. */}
            <SaveBar
              state={saveState}
              busy={isGenerating}
              onSave={() => saveLook(result)}
              onRegenerate={() => generate(result.sources)}
            />
          </>
        ) : (
          <EmptyStage presentation={presentation} onAttach={openPicker} />
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
              {attached.map((garment) => (
                <div key={garment.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={garment.previewUrl}
                    alt={garment.name}
                    className="border-border size-20 rounded-lg border object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(garment.id)}
                    aria-label={`Remove ${garment.name}`}
                    disabled={isGenerating}
                    className="bg-background absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border disabled:opacity-50"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
              {attached.length < MAX_TRY_ON_GARMENTS && (
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
                {attached.length} piece{attached.length === 1 ? "" : "s"} · worn
                together in one result
              </span>
              <Button onClick={() => generate(attached)} disabled={isGenerating}>
                <SparklesIcon />
                {isGenerating ? "Generating…" : "Generate look"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
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
