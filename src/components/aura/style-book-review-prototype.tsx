"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  CircleAlertIcon,
  ImageIcon,
  LinkIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";

import {
  auraStyleBookReviewSchema,
  type AuraReviewCategoryKey,
  type AuraStyleBookReview,
} from "@/lib/aura-style-book-review";
import { isLinkSource, type SavedLookSource } from "@/lib/aura-style-book";
import { cloudinaryThumbUrl } from "@/lib/cloudinary-url";
import type { StyleBookReviewVariant } from "@/lib/style-book-review-prototype-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StyleBookReviewLook = {
  id: string;
  caption: string;
  lookImageUrl: string;
  createdAt: string;
  sources: SavedLookSource[];
};

const CATEGORY_META: Record<
  AuraReviewCategoryKey,
  { title: string; eyebrow: string; accent: string }
> = {
  fit: {
    title: "Fit & silhouette",
    eyebrow: "Shape language",
    accent: "bg-brand-magenta",
  },
  colour: {
    title: "Colour & undertone",
    eyebrow: "Palette check",
    accent: "bg-brand-lime",
  },
  styling: {
    title: "Styling & versatility",
    eyebrow: "Final edit",
    accent: "bg-primary-foreground",
  },
};

/** Representative copy makes the visual prototype judgeable without an API key. */
const PROTOTYPE_REVIEW: AuraStyleBookReview = {
  overallScore: 4.4,
  description:
    "A refined off-duty look that balances tailored structure with relaxed denim proportions.",
  outfitReview:
    "It’s giving brunch-to-date energy: tailored layers keep it polished on you, while the deep neutrals make the whole look feel effortlessly put together.",
  categories: [
    {
      key: "fit",
      score: 4.6,
      verdict: "Long, clean lines",
      evidence:
        "The long outer layer creates a strong vertical frame while the cropped denim keeps the proportion feeling deliberate.",
      nextStep: "For a sharper finish, keep the top layer close to the waistline.",
    },
    {
      key: "colour",
      score: 4.2,
      verdict: "A cohesive tonal base",
      evidence:
        "The deep brown, black, and denim read as a controlled neutral palette with enough depth to stay interesting.",
      nextStep: "Try one muted accent close to the face when you want more lift.",
    },
    {
      key: "styling",
      score: 4.4,
      verdict: "Polished without feeling precious",
      evidence:
        "The boots, belt, and structured bag reinforce the tailored mood without making the outfit overly formal.",
      nextStep: "Swap the bag for a softer texture to make it more weekend-ready.",
    },
  ],
};

const CONFETTI_PIECES = Array.from({ length: 132 }, (_, index) => ({
  delay: `${(index % 12) * 20}ms`,
  duration: `${7800 + (index % 7) * 220}ms`,
  left: `${(index * 37) % 100}%`,
  top: `${-12 + (index % 8) * 11}vh`,
  rotation: `${(index * 47) % 360}deg`,
  size: `${7 + (index % 4) * 3}px`,
  tone:
    index % 3 === 0
      ? "var(--brand-magenta)"
      : index % 3 === 1
        ? "var(--brand-lime)"
        : "var(--foreground)",
  x: `${((index * 23) % 140) - 70}px`,
}));

async function playPerfectScoreChime(): Promise<boolean> {
  const audioContext = new window.AudioContext();

  try {
    await audioContext.resume();
    if (audioContext.state !== "running") throw new Error("Audio is unavailable");

    const now = audioContext.currentTime;
    const notes = [
      { frequency: 523.25, start: 0, duration: 0.42 },
      { frequency: 659.25, start: 0.16, duration: 0.44 },
      { frequency: 783.99, start: 0.32, duration: 0.54 },
      { frequency: 1046.5, start: 0.52, duration: 1.15 },
    ];

    notes.forEach(({ frequency, start: offset, duration }, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = now + offset;

      oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
    window.setTimeout(() => void audioContext.close(), 1900);
    return true;
  } catch {
    void audioContext.close();
    return false;
  }
}

function PerfectScoreCelebration({
  lookId,
  score,
  loopSound = false,
}: {
  lookId: string;
  score: number;
  /** Development-only replay mode for auditioning the celebration sound. */
  loopSound?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  const celebratedLookRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (score !== 5) return;

    const interactionController = new AbortController();
    let cancelled = false;
    let loopTimer: number | undefined;
    const playSound = async (): Promise<boolean> => {
      const played = await playPerfectScoreChime();
      if (played && loopSound && !cancelled) {
        loopTimer = window.setTimeout(() => void playSound(), 2200);
      }
      return played;
    };
    const playAfterInteraction = () => {
      interactionController.abort();
      void playSound();
    };

    if (celebratedLookRef.current !== lookId || loopSound) {
      celebratedLookRef.current = lookId;
      void playSound().then((played) => {
        if (played || cancelled) return;
        window.addEventListener("pointerdown", playAfterInteraction, {
          once: true,
          signal: interactionController.signal,
        });
        window.addEventListener("keydown", playAfterInteraction, {
          once: true,
          signal: interactionController.signal,
        });
      });
    }

    const reveal = window.requestAnimationFrame(() => setVisible(true));
    const dismiss = window.setTimeout(() => setVisible(false), 11_500);
    return () => {
      cancelled = true;
      interactionController.abort();
      window.clearTimeout(loopTimer);
      window.cancelAnimationFrame(reveal);
      window.clearTimeout(dismiss);
    };
  }, [lookId, loopSound, score]);

  if (!visible || score !== 5) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-live="assertive">
      <p className="sr-only">Perfect outfit score. AURA gave this look all five stars.</p>
      <div aria-hidden="true">
        {CONFETTI_PIECES.map((piece, index) => (
          <span
            key={index}
            className="aura-perfect-confetti"
            style={{
              "--confetti-delay": piece.delay,
              "--confetti-duration": piece.duration,
              "--confetti-rotation": piece.rotation,
              "--confetti-size": piece.size,
              "--confetti-tone": piece.tone,
              "--confetti-x": piece.x,
              left: piece.left,
              top: piece.top,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRatingScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function sourceCount(n: number): string {
  return `${n} source${n === 1 ? "" : "s"}`;
}

function useAuraReview(
  lookId: string,
  prototypeFallback?: AuraStyleBookReview,
) {
  const showPrototypeFallback = prototypeFallback !== undefined;
  const [review, setReview] = React.useState<AuraStyleBookReview | null>(
    prototypeFallback ?? null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadReview() {
      setLoading(true);
      setError(null);
      if (!showPrototypeFallback) setReview(null);
      try {
        const response = await fetch(
          `/api/aura/style-book/${encodeURIComponent(lookId)}/review`,
          { cache: "no-store", signal: controller.signal },
        );
        const body: unknown = await response.json().catch(() => null);
        const parsed = auraStyleBookReviewSchema.safeParse(body);
        if (!response.ok || !parsed.success) {
          const message =
            typeof body === "object" &&
            body !== null &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "AURA couldn't review this look right now.";
          throw new Error(message);
        }
        setReview(parsed.data);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "AURA couldn't review this look right now.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadReview();
    return () => controller.abort();
  }, [attempt, lookId, showPrototypeFallback]);

  return {
    review,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
      Back to Style Book
    </button>
  );
}

function LookImage({ look, className }: { look: StyleBookReviewLook; className?: string }) {
  return (
    <figure
      className={cn(
        "bg-card mx-auto w-fit overflow-hidden rounded-[1.4rem] border-2 border-foreground/10 p-2 shadow-[5px_5px_0_var(--color-border)]",
        className,
      )}
    >
      {/* The saved AURA look is the visual evidence for every prototype. The
          frame hugs the image (figure w-fit) and the image keeps its natural
          aspect, so the whole outfit shows — no head/feet crop (the old
          object-cover) and no letterbox gaps around it (a full-width
          object-contain box on a narrower portrait). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={look.lookImageUrl}
        alt={look.caption}
        className="mx-auto block max-h-[72vh] w-auto max-w-full rounded-[1rem]"
      />
    </figure>
  );
}

function Score({ score, large = false }: { score: number; large?: boolean }) {
  const rounded = Math.round(score);
  return (
    <div className="flex items-end gap-3">
      <p
        className={cn(
          "font-heading leading-none tracking-tight",
          large ? "text-7xl sm:text-8xl" : "text-4xl",
        )}
      >
        {formatRatingScore(score)}
      </p>
      <div className="pb-1">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase">AURA score</p>
        <div className="flex items-center gap-1" aria-label={`${formatRatingScore(score)} out of 5`}>
          <span className="flex" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <StarIcon
                key={index}
                className={cn(
                  "size-3.5",
                  index < rounded
                    ? "fill-brand-magenta text-brand-magenta"
                    : "text-muted-foreground/40",
                )}
              />
            ))}
          </span>
          <span className="sr-only">out of 5</span>
        </div>
      </div>
    </div>
  );
}

/** A quieter score treatment for the side-rail verdict layout. */
function MinimalRating({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
          AURA rating
        </p>
        <div className="flex items-center gap-1" aria-label={`${formatRatingScore(score)} out of 5`}>
          <span className="flex" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <StarIcon
                key={index}
                className={cn(
                  "size-5",
                  index < rounded
                    ? "fill-brand-magenta text-brand-magenta"
                    : "text-foreground/20",
                )}
              />
            ))}
          </span>
          <span className="ml-1 text-sm font-semibold tabular-nums">
            {formatRatingScore(score)}/5
          </span>
        </div>
      </div>
      {score === 5 ? (
        <p className="text-sm font-semibold text-brand-magenta">Perfect score!</p>
      ) : null}
    </div>
  );
}

/**
 * Loading placeholder for the rating box, mirroring {@link MinimalRating}'s
 * shape so the layout doesn't jump when the real score lands. Ghost stars pulse
 * and the label spins — the rating gets the same "working" affordance the
 * outfit review already has.
 */
function RatingLoading() {
  return (
    <div className="grid gap-1.5" role="status" aria-label="AURA is scoring this look">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
          AURA rating
        </p>
        <span className="flex animate-pulse items-center gap-1" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <StarIcon key={index} className="size-5 text-foreground/15" />
          ))}
        </span>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        AURA is scoring this look…
      </p>
    </div>
  );
}

function ReviewStatus({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        AURA is checking the visual details…
      </p>
    );
  }
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
        <CircleAlertIcon className="size-3.5 text-brand-magenta" />
        <span>{error}</span>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1 font-semibold text-foreground underline decoration-brand-magenta decoration-2 underline-offset-2 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
        >
          <RefreshCwIcon className="size-3" /> Retry
        </button>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground" role="status">
      <SparklesIcon className="size-3.5 text-brand-magenta" />
      Live AURA vision review
    </p>
  );
}

function ReviewCard({
  category,
  compact = false,
}: {
  category: AuraStyleBookReview["categories"][number];
  compact?: boolean;
}) {
  const meta = CATEGORY_META[category.key];
  return (
    <article
      className={cn(
        "rounded-[1.35rem] border-2 border-foreground bg-card p-5",
        compact ? "grid gap-3" : "grid gap-4",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-9 place-items-center rounded-full", meta.accent)}>
            <SparklesIcon className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">
              {meta.eyebrow}
            </p>
            <h3 className="font-heading text-xl tracking-wide uppercase">{meta.title}</h3>
          </div>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">{formatRatingScore(category.score)}/5</span>
      </div>
      <div className="grid gap-1.5">
        <p className="font-heading text-base tracking-wide uppercase">{category.verdict}</p>
        <p className="text-sm leading-6 text-foreground/80">{category.evidence}</p>
      </div>
      <p className="border-l-4 border-brand-magenta pl-3 text-sm leading-5">
        <span className="font-bold">Try next: </span>
        {category.nextStep}
      </p>
    </article>
  );
}

/**
 * The pasted-link source(s) behind a saved look, shown inside the review card.
 * Deterministic saved data — deliberately not gated on the AI review, so the
 * link is visible whether the verdict is loading, failed, or landed.
 */
function ReviewSourceLinks({ sources }: { sources: SavedLookSource[] }) {
  const linkSources = sources.filter(isLinkSource);
  if (linkSources.length === 0) return null;
  return (
    <div className="grid min-w-0 gap-1.5 text-xs">
      {linkSources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="flex w-full min-w-0 items-center gap-1.5 text-primary transition-colors hover:text-primary/75 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
        >
          <LinkIcon className="size-3 shrink-0" />
          <span className="min-w-0 truncate">Source: {source.url}</span>
        </a>
      ))}
    </div>
  );
}

/** Collapses the detailed model response into one concise, scan-friendly review. */
function CompactOutfitReview({
  review,
  sources,
}: {
  review: AuraStyleBookReview;
  sources: SavedLookSource[];
}) {
  const stylingNextStep = review.categories.find(
    (category) => category.key === "styling",
  )?.nextStep;

  return (
    <section
      className="grid min-w-0 gap-3 rounded-[1.25rem] border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_var(--color-border)]"
      aria-label="AURA outfit review"
    >
      <p className="font-heading text-2xl tracking-wide uppercase">AURA outfit review</p>
      <p className="line-clamp-2 text-sm leading-6 text-foreground/80">
        {review.outfitReview}
      </p>
      <ReviewSourceLinks sources={sources} />
      {stylingNextStep ? (
        <p className="border-l-4 border-brand-magenta pl-3 text-sm leading-5">
          <span className="font-bold">Try next: </span>
          {stylingNextStep}
        </p>
      ) : null}
    </section>
  );
}

function SourceStrip({ sources, direction = "row" }: { sources: SavedLookSource[]; direction?: "row" | "stack" }) {
  return (
    <section className="grid gap-3" aria-label="Look sources">
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
        {sourceCount(sources.length)} behind this look
      </p>
      <div className={cn(direction === "row" ? "flex overflow-x-auto pb-1" : "grid", "gap-2")}>
        {sources.map((source, index) => {
          const link = isLinkSource(source);
          return (
            <div
              key={`${source.name}-${index}`}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-xl border bg-card p-2",
                direction === "row" && "min-w-56",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cloudinaryThumbUrl(source.imageUrl, { width: 96, height: 96 })}
                alt={source.name}
                className="size-12 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{source.name}</p>
                {link ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-primary/75 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
                  >
                    <LinkIcon className="size-3" /> from {source.site}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ImageIcon className="size-3" /> uploaded image
                  </span>
                )}
              </div>
              <Badge variant={link ? "secondary" : "outline"} className="ml-auto">
                {link ? "link" : "upload"}
              </Badge>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EditorialDossier({
  look,
  review,
  loading,
  error,
  retry,
  onBack,
}: LayoutProps) {
  if (!review) return null;

  return (
    <div className="grid gap-7">
      {onBack ? <BackButton onBack={onBack} /> : null}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,.85fr)]">
        <LookImage look={look} />
        <aside className="grid gap-5 lg:pt-7">
          <div>
            <p className="font-heading text-sm tracking-[0.18em] uppercase text-brand-magenta">Saved look / 01</p>
            <h2 className="mt-2 font-heading text-4xl leading-[.9] tracking-wide uppercase text-balance sm:text-5xl">{look.caption}</h2>
            <p className="mt-3 text-sm text-muted-foreground">Saved {formatDate(look.createdAt)}</p>
          </div>
          <section className="grid gap-4 rounded-[1.5rem] border-2 border-foreground bg-brand-lime p-6 shadow-[5px_5px_0_var(--foreground)]">
            <Score score={review.overallScore} />
            <p className="text-base leading-6">{review.description}</p>
            <ReviewStatus loading={loading} error={error} retry={retry} />
          </section>
          <SourceStrip sources={look.sources} direction="stack" />
        </aside>
      </div>
      <section className="grid gap-3">
        <p className="font-heading text-2xl tracking-wide uppercase">AURA outfit review</p>
        <p className="text-sm text-muted-foreground">Visible details, translated into your next styling move.</p>
        <div className="grid gap-4 md:grid-cols-3">{review.categories.map((category) => <ReviewCard key={category.key} category={category} compact />)}</div>
      </section>
    </div>
  );
}

function AuraVerdict({
  look,
  review,
  loading,
  error,
  retry,
  onBack,
}: LayoutProps) {
  return (
    <div className="grid gap-5 pt-3 sm:pt-5">
      {onBack ? <BackButton onBack={onBack} /> : null}
      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
        <div className="lg:sticky lg:top-6">
          <LookImage look={look} />
        </div>
        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          <header>
            <p className="font-heading text-xs tracking-[0.18em] uppercase text-brand-magenta">AURA verdict</p>
            <h2 className="mt-1.5 font-heading text-2xl leading-[1.05] tracking-wide uppercase text-balance sm:text-3xl">{look.caption}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Saved {formatDate(look.createdAt)}</p>
          </header>
          <section className="grid gap-3 rounded-[1.25rem] border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_var(--foreground)]">
            {review ? (
              <MinimalRating score={review.overallScore} />
            ) : error ? (
              <p className="text-sm font-medium" role="status">
                AURA rating unavailable
              </p>
            ) : (
              <RatingLoading />
            )}
          </section>
          {review ? (
            <CompactOutfitReview review={review} sources={look.sources} />
          ) : (
            <section
              className="grid gap-3 rounded-[1.25rem] border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_var(--color-border)]"
              aria-label="AURA outfit review"
            >
              <p className="font-heading text-2xl tracking-wide uppercase">AURA outfit review</p>
              <ReviewStatus loading={loading} error={error} retry={retry} />
              <ReviewSourceLinks sources={look.sources} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * The selected, user-facing Style Book detail view. Unlike the visual board
 * below, this is deliberately fixed to the approved compact AURA verdict.
 */
export function StyleBookOutfitVerdict({
  look,
  onBack,
}: {
  look: StyleBookReviewLook;
  onBack: () => void;
}) {
  const reviewState = useAuraReview(look.id);
  const props = { look, onBack, ...reviewState };

  return (
    <>
      <PerfectScoreCelebration
        lookId={look.id}
        score={reviewState.review?.overallScore ?? 0}
      />
      <AuraVerdict {...props} />
    </>
  );
}

function StyleReport({
  look,
  review,
  loading,
  error,
  retry,
  onBack,
}: LayoutProps) {
  if (!review) return null;

  return (
    <div className="grid gap-7">
      {onBack ? <BackButton onBack={onBack} /> : null}
      <header className="border-y-2 border-foreground py-5 sm:flex sm:items-end sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] uppercase text-brand-magenta">AURA style report</p>
          <h2 className="mt-1 font-heading text-5xl leading-[.84] tracking-wide uppercase sm:text-7xl">The look, reviewed</h2>
        </div>
        <p className="mt-4 max-w-52 text-sm text-muted-foreground sm:mt-0">{formatDate(look.createdAt)} · {sourceCount(look.sources.length)}</p>
      </header>
      <div className="grid gap-7 lg:grid-cols-[.9fr_1.1fr]">
        <LookImage look={look} />
        <section className="grid content-start gap-7">
          <div className="grid gap-4 border-b-2 border-foreground pb-6">
            <p className="font-heading text-3xl tracking-wide uppercase">{look.caption}</p>
            <Score score={review.overallScore} large />
            <p className="max-w-xl text-lg leading-7">{review.description}</p>
            <ReviewStatus loading={loading} error={error} retry={retry} />
          </div>
          <div className="grid gap-4">
            {review.categories.map((category, index) => (
              <div key={category.key} className="grid gap-3 border-b border-foreground/25 pb-5 sm:grid-cols-[3rem_1fr]">
                <p className="font-heading text-4xl leading-none text-brand-magenta">0{index + 1}</p>
                <ReviewCard category={category} compact />
              </div>
            ))}
          </div>
        </section>
      </div>
      <SourceStrip sources={look.sources} />
    </div>
  );
}

type LayoutProps = {
  look: StyleBookReviewLook;
  review: AuraStyleBookReview | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  onBack?: () => void;
};

/**
 * Throwaway visual exploration for one saved look. Only the selected layout
 * should be reimplemented as production UI after the user chooses a direction.
 */
export function StyleBookReviewPrototype({
  look,
  onBack,
  variant,
  previewPerfectScore = false,
  previewSoundLoop = false,
}: {
  look: StyleBookReviewLook;
  onBack?: () => void;
  variant: StyleBookReviewVariant;
  /** Development-only trigger for reviewing the perfect-score celebration. */
  previewPerfectScore?: boolean;
  /** Development-only loop for auditioning the celebration sound. */
  previewSoundLoop?: boolean;
}) {
  const reviewState = useAuraReview(look.id, PROTOTYPE_REVIEW);
  const review = previewPerfectScore && reviewState.review
    ? { ...reviewState.review, overallScore: 5 }
    : reviewState.review;
  const props = { look, onBack, ...reviewState, review };

  return (
    <>
      <PerfectScoreCelebration
        lookId={look.id}
        score={review?.overallScore ?? 0}
        loopSound={previewSoundLoop}
      />
      {variant === "verdict" ? <AuraVerdict {...props} /> : null}
      {variant === "report" ? <StyleReport {...props} /> : null}
      {variant === "editorial" ? <EditorialDossier {...props} /> : null}
    </>
  );
}
