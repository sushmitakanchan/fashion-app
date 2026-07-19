"use client";

/** PROTOTYPE — throwaway floating variant switcher. Hidden in production. */

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VariantKey = "A" | "B" | "C";

export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: "Editorial — full-bleed",
  B: "Utility — dense toolbar",
  C: "Library — list + panel",
};

const ORDER: VariantKey[] = ["A", "B", "C"];

export function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: VariantKey;
  onChange: (next: VariantKey) => void;
}) {
  const step = React.useCallback(
    (dir: 1 | -1) => {
      const i = ORDER.indexOf(current);
      onChange(ORDER[(i + dir + ORDER.length) % ORDER.length]);
    },
    [current, onChange],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit items-center gap-1 rounded-full",
        "border border-white/10 bg-neutral-900 px-1.5 py-1.5 text-neutral-100 shadow-2xl",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="size-8 rounded-full text-neutral-100 hover:bg-white/10 hover:text-white"
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-56 px-2 text-center text-sm font-medium tabular-nums">
        {current} — {VARIANT_NAMES[current]}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="size-8 rounded-full text-neutral-100 hover:bg-white/10 hover:text-white"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
