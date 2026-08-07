import { notFound } from "next/navigation";

import { CalendarPrototypeSwitcher } from "@/components/aura/calendar-prototype-switcher";
import { VariantBoard } from "@/components/aura/calendar-prototype/variant-a-board";
import { VariantAgenda } from "@/components/aura/calendar-prototype/variant-b-agenda";
import { VariantFocus } from "@/components/aura/calendar-prototype/variant-c-focus";
import { readCalendarVariant } from "@/lib/calendar-prototype-state";

/**
 * Development-only visual board for the Outfit Calendar week-view (#162).
 *
 * Three radically different week surfaces switchable via `?variant=`:
 *   A (board)  — seven day-columns; scan the whole week.
 *   B (agenda) — vertical day-sectioned list; outfit gets room to act.
 *   C (focus)  — week rail + one big outfit & try-on preview (master-detail).
 *
 * No auth, no wardrobe fetch, no AI call, no persistence — mock data only. The
 * real surface would live at `/aura/calendar`, Clerk-protected like `/aura/try-on`.
 */
export default async function CalendarPrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { variant: requestedVariant } = await searchParams;
  const variant = readCalendarVariant(requestedVariant);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <p className="mb-6 rounded-xl border border-dashed border-foreground/30 bg-card px-4 py-3 text-sm text-muted-foreground">
        Development prototype — mock data only, no auth / wardrobe / AI. Flip
        variants with the pill below or the ← → arrow keys.
      </p>

      {variant === "board" && <VariantBoard />}
      {variant === "agenda" && <VariantAgenda />}
      {variant === "focus" && <VariantFocus />}

      <CalendarPrototypeSwitcher current={variant} />
    </main>
  );
}
