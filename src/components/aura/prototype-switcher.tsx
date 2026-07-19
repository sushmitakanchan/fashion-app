"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type Variant = "A" | "B" | "C";

export function PrototypeSwitcher({
  current,
  variants,
}: {
  current: Variant;
  variants: Record<Variant, string>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const keys = Object.keys(variants) as Variant[];

  const select = React.useCallback(
    (offset: number) => {
      const next = keys[(keys.indexOf(current) + offset + keys.length) % keys.length];
      router.replace(`${pathname}?prototype=try-on&variant=${next}`, { scroll: false });
    },
    [current, keys, pathname, router],
  );

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null;
      if (
        element?.matches("input, textarea, [contenteditable=true]") ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }

      event.preventDefault();
      select(event.key === "ArrowLeft" ? -1 : 1);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [select]);

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border bg-background p-1 shadow-lg">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous prototype variant"
          onClick={() => select(-1)}
        >
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-44 px-2 text-center text-sm font-medium">
          {current} — {variants[current]}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next prototype variant"
          onClick={() => select(1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
