"use client";

/**
 * PROTOTYPE — throwaway. Style Book design exploration.
 *
 * Three coherent design directions for the Style Book's three surfaces — the
 * save affordance on the try-on result stage, the saved-looks gallery, and the
 * saved-look detail view — each rendered on this one route with seeded mock
 * data (see ./mock). Switch between them with the floating bar (or ←/→), share
 * via `?variant=A|B|C`. Nothing persists; the save button fakes latency.
 *
 * Answers wayfinder ticket #86. NOT production code — folds into the real
 * try-on surface + a real /aura/style-book route once a direction is chosen.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { PrototypeSwitcher, VARIANT_NAMES, type VariantKey } from "./switcher";

function isVariant(v: string | null): v is VariantKey {
  return v === "A" || v === "B" || v === "C";
}

function Prototype() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("variant");
  const variant: VariantKey = isVariant(raw) ? raw : "A";

  const setVariant = React.useCallback(
    (next: VariantKey) => {
      const q = new URLSearchParams(params.toString());
      q.set("variant", next);
      router.replace(`?${q.toString()}`, { scroll: false });
    },
    [params, router],
  );

  return (
    <main className="min-h-dvh pb-24">
      <header className="border-b bg-muted/30">
        <div className="mx-auto w-full max-w-4xl px-6 py-4">
          <p className="text-muted-foreground font-geist-mono text-xs tracking-widest uppercase">
            Prototype · Style Book #86
          </p>
          <h1 className="text-lg font-medium">
            {variant} — {VARIANT_NAMES[variant]}
          </h1>
        </div>
      </header>

      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}

      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </main>
  );
}

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <Prototype />
    </React.Suspense>
  );
}
