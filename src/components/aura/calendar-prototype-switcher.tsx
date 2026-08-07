"use client";

import * as React from "react";
import { ArrowLeftIcon, ArrowRightIcon, FlaskConicalIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  CALENDAR_VARIANTS,
  showPrototypeControls,
  stepCalendarVariant,
  type CalendarVariant,
} from "@/lib/calendar-prototype-state";

function canHandleArrowKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  return !(
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

/** Development-only control for judging the three throwaway week-view layouts. */
export function CalendarPrototypeSwitcher({
  current,
}: {
  current: CalendarVariant;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const select = React.useCallback(
    (next: CalendarVariant) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const previous = React.useCallback(
    () => select(stepCalendarVariant(current, -1)),
    [current, select],
  );
  const next = React.useCallback(
    () => select(stepCalendarVariant(current, 1)),
    [current, select],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canHandleArrowKey(event.target)) return;
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous]);

  if (!showPrototypeControls(process.env.NODE_ENV)) return null;

  const active = CALENDAR_VARIANTS.find((variant) => variant.key === current)!;

  return (
    <aside
      aria-label="Outfit Calendar prototype switcher"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border-2 border-foreground bg-background p-1.5 text-foreground shadow-[4px_4px_0_var(--foreground)]"
    >
      <button
        type="button"
        onClick={previous}
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
        aria-label="Show previous prototype"
      >
        <ArrowLeftIcon className="size-4" />
      </button>
      <div className="min-w-0 px-2 text-center" aria-live="polite">
        <p className="flex items-center justify-center gap-1 text-[10px] font-bold tracking-[0.16em] uppercase">
          <FlaskConicalIcon className="size-3" /> Prototype
        </p>
        <p className="truncate text-xs font-semibold">{active.label}</p>
      </div>
      <button
        type="button"
        onClick={next}
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-accent focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none"
        aria-label="Show next prototype"
      >
        <ArrowRightIcon className="size-4" />
      </button>
    </aside>
  );
}
