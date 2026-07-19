"use client"; // Error boundaries must be Client Components

import * as React from "react";
import { AlertCircleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for `/aura/style-book`. One of only two pieces of
 * net-new non-feature code in the Style Book effort: it catches a thrown
 * listing `findMany` (a transient database blip) and offers a retry, so a
 * failed load is recoverable rather than a blank crash — and stays distinct
 * from the empty state (an empty book is a successful load of zero looks).
 *
 * `unstable_retry()` re-runs the boundary's Server Component children (the page
 * and its `findMany`), swapping this fallback back for the gallery on success.
 */
export default function StyleBookError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  React.useEffect(() => {
    console.error("Style Book failed to load", error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div
        role="alert"
        className="border-destructive/50 bg-destructive/5 grid min-h-72 place-items-center rounded-2xl border p-6 text-center"
      >
        <div className="grid max-w-sm justify-items-center gap-3">
          <AlertCircleIcon className="text-destructive size-9" />
          <h1 className="text-lg font-medium">
            We couldn&rsquo;t open your Style Book
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">
            Something went wrong loading your saved looks. Your looks are safe —
            this is usually temporary, so please try again.
          </p>
          <Button variant="outline" onClick={() => unstable_retry()}>
            <RotateCcwIcon />
            Try again
          </Button>
        </div>
      </div>
    </main>
  );
}
