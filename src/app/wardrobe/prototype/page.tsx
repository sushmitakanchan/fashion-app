import { notFound } from "next/navigation";

import { WardrobeReviewPrototype } from "@/components/wardrobe/wardrobe-review-prototype";

/** Three throwaway bulk-review layouts, switchable with ?variant=grid|focus|board. */
export default async function WardrobeReviewPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { variant } = await searchParams;
  return <WardrobeReviewPrototype requestedVariant={variant} />;
}
