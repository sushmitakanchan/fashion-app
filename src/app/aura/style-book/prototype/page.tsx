import { notFound } from "next/navigation";

import { StyleBookReviewDemo } from "@/components/aura/style-book-review-demo";
import { readStyleBookReviewVariant } from "@/lib/style-book-review-prototype-state";

/** Development-only visual board for reviewing the Style Book layout. */
export default async function StyleBookReviewPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string; perfect?: string; sound?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { variant: requestedVariant, perfect, sound } = await searchParams;
  const variant = readStyleBookReviewVariant(requestedVariant);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <p className="mb-6 rounded-xl border border-dashed border-foreground/30 bg-card px-4 py-3 text-sm text-muted-foreground">
        Development prototype — no saved look or AI call is used on this page.
      </p>
      <StyleBookReviewDemo
        variant={variant}
        previewPerfectScore={perfect === "1"}
        previewSoundLoop={sound === "loop"}
      />
    </main>
  );
}
