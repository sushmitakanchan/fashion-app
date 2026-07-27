/**
 * UI-prototype-only routing state for the three Style Book detail layouts.
 *
 * Three variants of the saved-look detail view, switchable via `?variant=`,
 * on the existing `/aura/style-book` route.
 */
export const STYLE_BOOK_REVIEW_VARIANTS = [
  {
    key: "editorial",
    label: "A — Editorial dossier",
    description: "Portrait first, with AURA insight in a supporting rail.",
  },
  {
    key: "verdict",
    label: "B — AURA verdict",
    description: "The score and recommendation lead the page.",
  },
  {
    key: "report",
    label: "C — Style report",
    description: "A magazine-style vertical story of the look.",
  },
] as const;

export type StyleBookReviewVariant =
  (typeof STYLE_BOOK_REVIEW_VARIANTS)[number]["key"];

const DEFAULT_VARIANT: StyleBookReviewVariant = "editorial";

export function readStyleBookReviewVariant(
  value: string | null | undefined,
): StyleBookReviewVariant {
  const match = STYLE_BOOK_REVIEW_VARIANTS.find(
    (variant) => variant.key === value,
  );
  return match?.key ?? DEFAULT_VARIANT;
}

export function stepStyleBookReviewVariant(
  current: StyleBookReviewVariant,
  direction: -1 | 1,
): StyleBookReviewVariant {
  const index = STYLE_BOOK_REVIEW_VARIANTS.findIndex(
    (variant) => variant.key === current,
  );
  return STYLE_BOOK_REVIEW_VARIANTS[
    (index + direction + STYLE_BOOK_REVIEW_VARIANTS.length) %
      STYLE_BOOK_REVIEW_VARIANTS.length
  ].key;
}

/** Kept pure so the production safety gate has a direct regression test. */
export function showPrototypeControls(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
