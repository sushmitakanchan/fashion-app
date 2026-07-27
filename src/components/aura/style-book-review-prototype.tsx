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
import { Button } from "@/components/ui/button";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sourceCount(n: number): string {
  return `${n} source${n === 1 ? "" : "s"}`;
}

function useAuraReview(lookId: string) {
  const [review, setReview] = React.useState<AuraStyleBookReview>(PROTOTYPE_REVIEW);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadReview() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/aura/style-book/${encodeURIComponent(lookId)}/review`,
          { signal: controller.signal },
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
  }, [attempt, lookId]);

  return {
    review,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
      <ArrowLeftIcon />
      Back to Style Book
    </Button>
  );
}

function LookImage({ look, className }: { look: StyleBookReviewLook; className?: string }) {
  return (
    <figure
      className={cn(
        "bg-card overflow-hidden rounded-[1.4rem] border-2 border-foreground/10 p-2 shadow-[5px_5px_0_var(--color-border)]",
        className,
      )}
    >
      {/* The saved AURA look is the visual evidence for every prototype. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={look.lookImageUrl}
        alt={look.caption}
        className="h-full max-h-[72vh] w-full rounded-[1rem] object-cover"
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
        {score.toFixed(1)}
      </p>
      <div className="pb-1">
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase">AURA score</p>
        <div className="flex items-center gap-1" aria-label={`${score.toFixed(1)} out of 5`}>
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
        <span>{error} Showing a prototype preview.</span>
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
        <span className="shrink-0 text-sm font-bold tabular-nums">{category.score.toFixed(1)}/5</span>
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
                    className="inline-flex items-center gap-1 text-xs text-primary underline decoration-brand-magenta decoration-2 underline-offset-2"
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
  return (
    <div className="grid gap-7">
      <BackButton onBack={onBack} />
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
    <div className="grid gap-7">
      <BackButton onBack={onBack} />
      <section className="grid gap-6 rounded-[1.75rem] border-2 border-foreground bg-foreground p-6 text-primary-foreground shadow-[7px_7px_0_var(--color-brand-magenta)] sm:p-8 lg:grid-cols-[.85fr_1.15fr] lg:items-end">
        <div className="grid gap-5">
          <p className="font-heading text-lg tracking-[0.18em] uppercase text-brand-lime">AURA verdict</p>
          <Score score={review.overallScore} large />
          <p className="max-w-sm text-lg leading-7">{review.description}</p>
          <ReviewStatus loading={loading} error={error} retry={retry} />
        </div>
        <div className="border-t border-primary-foreground/30 pt-5 lg:border-t-0 lg:border-l lg:pl-7 lg:pt-0">
          <p className="font-heading text-3xl leading-none tracking-wide uppercase sm:text-4xl">{look.caption}</p>
          <p className="mt-3 text-sm text-primary-foreground/70">A saved look from {formatDate(look.createdAt)}. AURA sees the outfit first, then the portrait it was generated against.</p>
        </div>
      </section>
      <div className="grid gap-7 lg:grid-cols-[minmax(17rem,.75fr)_minmax(0,1.25fr)]">
        <div className="grid content-start gap-5">
          <LookImage look={look} className="max-h-[65vh]" />
          <SourceStrip sources={look.sources} />
        </div>
        <section className="grid gap-4" aria-label="AURA category review">
          {review.categories.map((category) => <ReviewCard key={category.key} category={category} />)}
        </section>
      </div>
    </div>
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
  return (
    <div className="grid gap-7">
      <BackButton onBack={onBack} />
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
  review: AuraStyleBookReview;
  loading: boolean;
  error: string | null;
  retry: () => void;
  onBack: () => void;
};

/**
 * Throwaway visual exploration for one saved look. Only the selected layout
 * should be reimplemented as production UI after the user chooses a direction.
 */
export function StyleBookReviewPrototype({
  look,
  onBack,
  variant,
}: {
  look: StyleBookReviewLook;
  onBack: () => void;
  variant: StyleBookReviewVariant;
}) {
  const reviewState = useAuraReview(look.id);
  const props = { look, onBack, ...reviewState };

  switch (variant) {
    case "verdict":
      return <AuraVerdict {...props} />;
    case "report":
      return <StyleReport {...props} />;
    case "editorial":
      return <EditorialDossier {...props} />;
  }
}
