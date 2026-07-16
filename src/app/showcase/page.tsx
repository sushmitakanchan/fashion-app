import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { ProductViewer } from "@/components/three/product-viewer";

export const metadata: Metadata = {
  title: "3D Showcase — Fashion App",
};

export default function ShowcasePage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      <div className="mb-8 text-center">
        <Badge variant="secondary" className="mb-4">
          React Three Fiber
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          3D product showcase
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-pretty">
          A React Three Fiber canvas with drei helpers — drag to orbit. Swap the
          mesh for a GLTF garment using the <code>Model</code> component.
        </p>
      </div>
      <div className="bg-muted/20 overflow-hidden rounded-xl border">
        <ProductViewer />
      </div>
    </main>
  );
}
