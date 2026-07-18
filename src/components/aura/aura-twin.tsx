"use client";

import dynamic from "next/dynamic";

import type { BodyMeasurements } from "@/lib/aura";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Client-side only: keeps three.js / drei out of the server bundle entirely and
// sidesteps any `window` access during SSR. Same pattern as product-viewer.tsx.
const AuraTwinScene = dynamic(() => import("@/components/three/aura-twin-scene"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

export function AuraTwin({
  measurements,
  className,
}: {
  measurements: BodyMeasurements;
  className?: string;
}) {
  return (
    <div className={cn("relative h-[60vh] min-h-100 w-full", className)}>
      <AuraTwinScene measurements={measurements} />
    </div>
  );
}
