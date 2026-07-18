"use client";

/** PROTOTYPE ONLY — throwaway. Not for production. */

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  extras,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
  extras?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const canCycle = variants.length > 1;

  const go = React.useCallback(
    (delta: number) => {
      if (!canCycle) return;
      const next = variants[(index + delta + variants.length) % variants.length];
      const q = new URLSearchParams(params.toString());
      q.set("variant", next.key);
      router.replace(`${pathname}?${q.toString()}`);
    },
    [canCycle, index, params, pathname, router, variants],
  );

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement;
      if (
        !canCycle ||
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCycle, go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-neutral-900 px-2 py-2 text-sm text-white shadow-2xl">
      {canCycle ? (
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous variant"
          className="rounded-full p-2 hover:bg-white/10"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
      ) : null}
      <span className="min-w-44 px-2 text-center font-mono text-xs">
        {variants[index].key} — {variants[index].name}
      </span>
      {canCycle ? (
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next variant"
          className="rounded-full p-2 hover:bg-white/10"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      ) : null}
      {extras ? (
        <>
          <span className="mx-1 h-6 w-px bg-white/20" />
          {extras}
        </>
      ) : null}
    </div>
  );
}
