"use client";

// PROTOTYPE — throwaway floating variant switcher. Cycles ?variant= via the
// router; hidden in production so a stray merge can't ship it.

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export function PrototypeSwitcher({
  variants,
}: {
  variants: { key: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = React.useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      router.replace(`?variant=${next.key}`);
    },
    [index, router, variants],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  const active = variants[index];
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center">
      <div className="bg-foreground text-background flex items-center gap-3 rounded-full px-2 py-1.5 shadow-lg">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="grid size-7 place-items-center rounded-full hover:opacity-70"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="min-w-64 text-center text-sm font-medium">
          {active.key} — {active.name}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="grid size-7 place-items-center rounded-full hover:opacity-70"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
