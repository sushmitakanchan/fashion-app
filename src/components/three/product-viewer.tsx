"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// Load the WebGL scene client-side only. `ssr: false` keeps three.js / drei out
// of the server bundle entirely, avoiding any SSR/`window` issues.
const ProductScene = dynamic(() => import("./product-scene"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

export function ProductViewer({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-[60vh] w-full", className)}>
      <ProductScene />
    </div>
  );
}
