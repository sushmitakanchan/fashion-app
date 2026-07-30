"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { downscalePhoto } from "@/lib/aura";
import {
  PHOTO_MAX_EDGE,
  WARDROBE_IMPORT_MAX_BATCH,
  WARDROBE_ITEM_CATEGORIES,
  type WardrobeItemCategoryValue,
} from "@/lib/validations";
import {
  applySuggestion,
  canSave,
  confirmedItemsForSave,
  createReviewState,
  editItem,
  firstIndexNeedingAttention,
  goToIndex,
  healthSummary,
  isItemComplete,
  nextItem,
  prevItem,
  removeItem,
  replaceFailedItem,
  type ImportOutcome,
  type PendingReviewItem,
  type ReviewFields,
  type ReviewState,
} from "@/lib/wardrobe-import-review";
import {
  WARDROBE_ANALYSIS_DISCLOSURE,
  WARDROBE_ANALYSIS_POLICY_VERSION,
  type WardrobeAnalysisOutcome,
} from "@/lib/wardrobe-analysis-policy";

const CATEGORY_LABELS: Record<WardrobeItemCategoryValue, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  activewear: "Activewear",
  outerwear: "Outerwear",
  bags: "Bags",
  shoes: "Shoes",
  accessories: "Accessories",
};

type ImportResponse = {
  items?: ImportOutcome[];
  error?: string;
};

/** Strip a file name down to a friendly starter name for its Wardrobe Item. */
function deriveName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.length > 0 ? base : "New piece";
}

/** Encode one picked file to a downscaled data URI, tagged with a stable id. */
async function encodeFile(file: File): Promise<{ clientId: string; dataUri: string; name: string }> {
  const dataUri = await downscalePhoto(file, PHOTO_MAX_EDGE);
  return { clientId: crypto.randomUUID(), dataUri, name: deriveName(file.name) };
}

/**
 * The wardrobe batch import + focused review flow: pick up to 20 images, ingest
 * them server-side into private renditions, confirm one piece at a time, resolve
 * any failed imports, and save the confirmed batch. All review bookkeeping lives
 * in the pure `wardrobe-import-review` state; this component is the presentation
 * and the two network calls around it.
 */
export function WardrobeImport() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<"select" | "importing" | "review" | "saving">("select");
  const [review, setReview] = React.useState<ReviewState | null>(null);
  // Local previews keyed by client id — the uploaded renditions are private, so
  // the just-encoded image the owner picked is what we show during review.
  const [previews, setPreviews] = React.useState<Map<string, string>>(new Map());
  const fileInput = React.useRef<HTMLInputElement>(null);
  const replaceInput = React.useRef<HTMLInputElement>(null);
  const replaceTargetId = React.useRef<string | null>(null);
  // Optional AI-suggestion flow. `analyzing` blocks the review controls while a
  // batch is out to the model; `showDisclosure` gates the first opt-in.
  const [analyzing, setAnalyzing] = React.useState(false);
  const [showDisclosure, setShowDisclosure] = React.useState(false);

  async function runImport(
    files: File[],
  ): Promise<{ outcomes: ImportOutcome[]; previewEntries: [string, string][] } | null> {
    const encoded = await Promise.all(files.map(encodeFile));
    const response = await fetch("/api/wardrobe/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        images: encoded.map(({ clientId, dataUri }) => ({ clientId, dataUri })),
      }),
    });
    const body = (await response.json().catch(() => null)) as ImportResponse | null;
    if (!response.ok || !body?.items) {
      toast.error("We couldn't import those images", {
        description: body?.error ?? "Please try again.",
      });
      return null;
    }
    // Carry each picked file's derived name and preview forward.
    const byId = new Map(encoded.map((item) => [item.clientId, item]));
    const previewEntries: [string, string][] = [];
    const outcomes = body.items.map((outcome): ImportOutcome => {
      const source = byId.get(outcome.clientId);
      if (source) previewEntries.push([outcome.clientId, source.dataUri]);
      return outcome.status === "ready" && source
        ? { ...outcome, suggestedName: source.name }
        : outcome;
    });
    return { outcomes, previewEntries };
  }

  async function onPickFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (fileInput.current) fileInput.current.value = "";
    if (files.length === 0) return;
    if (files.length > WARDROBE_IMPORT_MAX_BATCH) {
      toast.error(`Import up to ${WARDROBE_IMPORT_MAX_BATCH} images at a time`, {
        description: `You picked ${files.length}. Trim your selection and try again.`,
      });
      return;
    }

    setPhase("importing");
    try {
      const result = await runImport(files);
      if (!result) {
        setPhase("select");
        return;
      }
      setPreviews(new Map(result.previewEntries));
      setReview(createReviewState(result.outcomes));
      setPhase("review");
    } catch {
      toast.error("We couldn't read one of those images", {
        description: "Please try a different file.",
      });
      setPhase("select");
    }
  }

  async function onReplaceFile(list: FileList | null) {
    const file = list?.[0];
    const targetId = replaceTargetId.current;
    if (replaceInput.current) replaceInput.current.value = "";
    replaceTargetId.current = null;
    if (!file || !targetId) return;

    setPhase("importing");
    try {
      const result = await runImport([file]);
      if (!result) {
        setPhase("review");
        return;
      }
      const replacement = result.outcomes[0];
      // Preserve the failed item's slot by reusing its client id (the import
      // minted a fresh one), and file the new preview under that same id.
      const newPreview = result.previewEntries.find(([id]) => id === replacement.clientId)?.[1];
      setPreviews((prev) => {
        const next = new Map(prev);
        if (newPreview) next.set(targetId, newPreview);
        return next;
      });
      const reIded: ImportOutcome = { ...replacement, clientId: targetId };
      setReview((state) => (state ? replaceFailedItem(state, targetId, reIded) : state));
      setPhase("review");
    } catch {
      toast.error("We couldn't read that image", { description: "Please try another." });
      setPhase("review");
    }
  }

  async function onSave() {
    if (!review || !canSave(review)) return;
    setPhase("saving");
    try {
      const response = await fetch("/api/wardrobe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: confirmedItemsForSave(review) }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error("We couldn't save your wardrobe", {
          description: body?.error ?? "Please try again.",
        });
        setPhase("review");
        return;
      }
      toast.success("Saved to your wardrobe");
      router.push("/wardrobe");
      router.refresh();
    } catch {
      toast.error("We couldn't save your wardrobe", { description: "Please try again." });
      setPhase("review");
    }
  }

  /** Send this batch's pending normalized images for optional AI suggestions and
   *  pre-fill each editable field. Only "suggested" outcomes apply; anything the
   *  model was unsure about stays in manual review, unfabricated. */
  async function analyzeBatch() {
    if (!review) return;
    const pending = review.items.filter(
      (item): item is PendingReviewItem => item.status === "pending",
    );
    if (pending.length === 0) {
      toast("Nothing to analyse yet.");
      return;
    }

    setAnalyzing(true);
    try {
      const response = await fetch("/api/wardrobe/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: pending.map((item) => ({
            clientId: item.id,
            normalizedMediaId: item.media.normalizedMediaId,
            normalizedMediaFormat: item.media.normalizedMediaFormat,
          })),
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        items?: (WardrobeAnalysisOutcome & { clientId: string })[];
        error?: string;
      } | null;
      if (!response.ok || !body?.items) {
        toast.error("We couldn't get AI suggestions", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }

      const outcomes = body.items;
      setReview((state) => {
        if (!state) return state;
        return outcomes.reduce(
          (next, outcome) =>
            outcome.status === "suggested"
              ? applySuggestion(next, outcome.clientId, outcome.suggestion)
              : next,
          state,
        );
      });

      const suggested = outcomes.filter((o) => o.status === "suggested").length;
      const needsReview = outcomes.length - suggested;
      toast.success(`AI suggested ${suggested} ${suggested === 1 ? "piece" : "pieces"}`, {
        description:
          needsReview > 0
            ? `${needsReview} left for you to review — nothing was guessed.`
            : "Every suggestion is editable.",
      });
    } catch {
      toast.error("We couldn't get AI suggestions", { description: "Please try again." });
    } finally {
      setAnalyzing(false);
    }
  }

  /** Entry point for the AI-suggestions button: analyse straight away when
   *  consent is already active, otherwise open the disclosure first. */
  async function requestSuggestions() {
    if (!review || analyzing) return;
    let active = false;
    try {
      const response = await fetch("/api/wardrobe/analyze/consent");
      const body = (await response.json().catch(() => null)) as { active?: boolean } | null;
      active = Boolean(response.ok && body?.active);
    } catch {
      active = false;
    }
    if (active) await analyzeBatch();
    else setShowDisclosure(true);
  }

  /** Record consent for the disclosed policy version, then analyse. */
  async function grantConsentAndAnalyze() {
    try {
      const response = await fetch("/api/wardrobe/analyze/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: WARDROBE_ANALYSIS_POLICY_VERSION }),
      });
      const body = (await response.json().catch(() => null)) as {
        active?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !body?.active) {
        toast.error("We couldn't record your choice", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      setShowDisclosure(false);
      await analyzeBatch();
    } catch {
      toast.error("We couldn't record your choice", { description: "Please try again." });
    }
  }

  /** Withdraw consent to future analysis; saved pieces are untouched. */
  async function withdrawConsent() {
    try {
      const response = await fetch("/api/wardrobe/analyze/consent", { method: "DELETE" });
      if (!response.ok) throw new Error("withdraw failed");
      toast.success("AI analysis turned off", {
        description: "Future imports won't be analysed. Your saved pieces are untouched.",
      });
    } catch {
      toast.error("We couldn't update that choice", { description: "Please try again." });
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">
          Build your wardrobe
        </p>
        <h1 className="font-heading mt-2 text-4xl leading-[0.9] tracking-wide uppercase sm:text-5xl">
          Import your pieces
        </h1>
        <p className="text-muted-foreground mt-3 max-w-md text-sm text-pretty">
          Add up to {WARDROBE_IMPORT_MAX_BATCH} clothing photos, confirm each one,
          and save them to your private wardrobe.
        </p>
      </header>

      {phase === "review" && review ? (
        <div className="grid gap-5">
          <AiSuggestBar
            analyzing={analyzing}
            onSuggest={() => void requestSuggestions()}
            onWithdraw={() => void withdrawConsent()}
          />
          <ReviewPanel
            review={review}
            previews={previews}
            busy={analyzing}
            onEdit={(id, patch) => setReview((state) => (state ? editItem(state, id, patch) : state))}
            onGoTo={(index) => setReview((state) => (state ? goToIndex(state, index) : state))}
            onPrev={() => setReview((state) => (state ? prevItem(state) : state))}
            onNext={() => setReview((state) => (state ? nextItem(state) : state))}
            onRemove={(id) => setReview((state) => (state ? removeItem(state, id) : state))}
            onReplace={(id) => {
              replaceTargetId.current = id;
              replaceInput.current?.click();
            }}
            onSave={onSave}
          />
        </div>
      ) : phase === "saving" && review ? (
        <ReviewPanel
          review={review}
          previews={previews}
          busy
          onEdit={() => {}}
          onGoTo={() => {}}
          onPrev={() => {}}
          onNext={() => {}}
          onRemove={() => {}}
          onReplace={() => {}}
          onSave={() => {}}
        />
      ) : (
        <SelectPanel
          busy={phase === "importing"}
          onPick={() => fileInput.current?.click()}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void onPickFiles(event.target.files)}
      />
      <input
        ref={replaceInput}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => void onReplaceFile(event.target.files)}
      />

      {showDisclosure ? (
        <DisclosureModal
          onAgree={() => void grantConsentAndAnalyze()}
          onCancel={() => setShowDisclosure(false)}
        />
      ) : null}
    </main>
  );
}

function AiSuggestBar({
  analyzing,
  onSuggest,
  onWithdraw,
}: {
  analyzing: boolean;
  onSuggest: () => void;
  onWithdraw: () => void;
}) {
  return (
    <div className="border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3.5 sm:p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold">Speed this up with AI</p>
        <p className="text-muted-foreground text-xs text-pretty">
          Optional. Suggests a category, colour, and brand — you confirm every one.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onWithdraw}
          disabled={analyzing}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring text-xs underline underline-offset-4 focus-visible:ring-3 focus-visible:outline-none disabled:opacity-50"
        >
          Turn off
        </button>
        <Button type="button" onClick={onSuggest} disabled={analyzing}>
          {analyzing ? "Analysing…" : "Suggest with AI"}
        </Button>
      </div>
    </div>
  );
}

function DisclosureModal({
  onAgree,
  onCancel,
}: {
  onAgree: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="bg-brand-ink/35 fixed inset-0 z-50 grid place-items-end p-3 backdrop-blur-sm sm:place-items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-disclosure-title"
        className="bg-card text-card-foreground w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-7"
      >
        <h2
          id="ai-disclosure-title"
          className="font-heading text-2xl tracking-wide uppercase"
        >
          Before AURA uses AI
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
          {WARDROBE_ANALYSIS_DISCLOSURE}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Not now
          </Button>
          <Button type="button" onClick={onAgree}>
            I agree — suggest
          </Button>
        </div>
      </section>
    </div>
  );
}

function SelectPanel({ busy, onPick }: { busy: boolean; onPick: () => void }) {
  return (
    <div className="border-border bg-card grid min-h-64 place-items-center rounded-2xl border border-dashed p-8 text-center">
      <div>
        <p className="font-heading text-2xl tracking-wide uppercase">
          {busy ? "Importing…" : "Choose your images"}
        </p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm text-pretty">
          JPEG, PNG, or WebP. We&apos;ll ingest each one privately — you confirm
          the details before anything is saved.
        </p>
        <Button type="button" className="mt-5" onClick={onPick} disabled={busy}>
          {busy ? "Importing…" : "Select images"}
        </Button>
      </div>
    </div>
  );
}

function ReviewPanel({
  review,
  previews,
  busy,
  onEdit,
  onGoTo,
  onPrev,
  onNext,
  onRemove,
  onReplace,
  onSave,
}: {
  review: ReviewState;
  previews: Map<string, string>;
  busy: boolean;
  onEdit: (id: string, patch: Partial<ReviewFields>) => void;
  onGoTo: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  onSave: () => void;
}) {
  const health = healthSummary(review);
  const attentionIndex = firstIndexNeedingAttention(review);
  const item = review.items[review.currentIndex];
  const saveReady = canSave(review);

  if (!item) {
    return (
      <div className="border-border bg-card grid min-h-52 place-items-center rounded-2xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Every image was removed. Go back to import more.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <HealthTiles
        health={health}
        onJumpToAttention={attentionIndex >= 0 ? () => onGoTo(attentionIndex) : undefined}
      />

      <div className="text-muted-foreground flex items-center justify-between text-xs font-bold tracking-wide uppercase">
        <span>
          Item {review.currentIndex + 1} of {review.items.length}
        </span>
        <span aria-live="polite">
          {health.ready} of {health.total} ready
        </span>
      </div>

      <article className="bg-card overflow-hidden rounded-2xl border">
        <div className="bg-muted aspect-[4/3] w-full">
          {previews.get(item.id) ? (
            // A locally-encoded preview of the owner's own picked image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previews.get(item.id)}
              alt={item.status === "pending" ? item.fields.name || "Imported piece" : "Failed import"}
              className={cn(
                "size-full object-contain",
                item.status === "failed" && "opacity-40 grayscale",
              )}
            />
          ) : null}
        </div>

        <div className="p-5 sm:p-6">
          {item.status === "failed" ? (
            <FailedItemFields
              reason={item.reason}
              busy={busy}
              onReplace={() => onReplace(item.id)}
              onRemove={() => onRemove(item.id)}
            />
          ) : (
            <PendingItemFields
              id={item.id}
              category={item.fields.category}
              name={item.fields.name}
              color={item.fields.color}
              brand={item.fields.brand}
              complete={isItemComplete(item)}
              busy={busy}
              onEdit={onEdit}
              onRemove={() => onRemove(item.id)}
            />
          )}
        </div>
      </article>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onPrev}
            disabled={busy || review.currentIndex === 0}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onNext}
            disabled={busy || review.currentIndex === review.items.length - 1}
          >
            Next
          </Button>
        </div>
        <Button type="button" onClick={onSave} disabled={!saveReady || busy}>
          {busy ? "Saving…" : `Save ${health.total} to wardrobe`}
        </Button>
      </div>
      {!saveReady ? (
        <p className="text-muted-foreground text-right text-xs">
          {health.failed > 0
            ? "Replace or remove failed imports before saving."
            : "Confirm every piece before saving."}
        </p>
      ) : null}
    </div>
  );
}

function HealthTiles({
  health,
  onJumpToAttention,
}: {
  health: ReturnType<typeof healthSummary>;
  onJumpToAttention?: () => void;
}) {
  const needsAttention = health.incomplete + health.failed;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile label="Ready" value={health.ready} tone="ok" />
      <Tile label="To confirm" value={health.incomplete} tone={health.incomplete ? "warn" : "muted"} />
      <button
        type="button"
        onClick={onJumpToAttention}
        disabled={!onJumpToAttention}
        className={cn(
          "rounded-xl border p-3 text-left transition-colors",
          health.failed
            ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
            : "border-border bg-card",
          !onJumpToAttention && "cursor-default",
        )}
      >
        <p className="text-muted-foreground text-[10px] font-bold tracking-[0.14em] uppercase">
          Failed
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{health.failed}</p>
        {needsAttention > 0 && onJumpToAttention ? (
          <p className="text-muted-foreground mt-0.5 text-[10px]">Tap to review</p>
        ) : null}
      </button>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "ok" && "border-primary/30 bg-primary/5",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5",
        tone === "muted" && "border-border bg-card",
      )}
    >
      <p className="text-muted-foreground text-[10px] font-bold tracking-[0.14em] uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function FailedItemFields({
  reason,
  busy,
  onReplace,
  onRemove,
}: {
  reason: string;
  busy: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <Badge variant="outline" className="border-destructive/40 text-destructive">
          Import failed
        </Badge>
        <p className="text-muted-foreground mt-2 text-sm">{reason}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={onReplace} disabled={busy}>
          Replace image
        </Button>
        <Button type="button" variant="outline" onClick={onRemove} disabled={busy}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function PendingItemFields({
  id,
  category,
  name,
  color,
  brand,
  complete,
  busy,
  onEdit,
  onRemove,
}: {
  id: string;
  category: WardrobeItemCategoryValue | null;
  name: string;
  color: string;
  brand: string;
  complete: boolean;
  busy: boolean;
  onEdit: (id: string, patch: Partial<ReviewFields>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Category</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          {WARDROBE_ITEM_CATEGORIES.map((option) => {
            const selected = category === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onEdit(id, { category: option })}
                className={cn(
                  "focus-visible:ring-ring rounded-full border px-3.5 py-1.5 text-xs font-bold tracking-wide uppercase transition-colors focus-visible:ring-3 focus-visible:outline-none",
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-transparent hover:bg-accent",
                )}
              >
                {CATEGORY_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`name-${id}`}>Name</Label>
        <Input
          id={`name-${id}`}
          value={name}
          disabled={busy}
          placeholder="e.g. Linen shirt"
          onChange={(event) => onEdit(id, { name: event.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`color-${id}`}>Colour</Label>
          <Input
            id={`color-${id}`}
            value={color}
            disabled={busy}
            placeholder="e.g. Ivory"
            onChange={(event) => onEdit(id, { color: event.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`brand-${id}`}>
            Brand <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id={`brand-${id}`}
            value={brand}
            disabled={busy}
            placeholder="e.g. AURA"
            onChange={(event) => onEdit(id, { brand: event.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold", complete ? "text-primary" : "text-muted-foreground")}>
          {complete ? "Ready to save" : "Add a category, name, and colour"}
        </span>
        <Button type="button" variant="ghost" onClick={onRemove} disabled={busy}>
          Remove
        </Button>
      </div>
    </div>
  );
}
