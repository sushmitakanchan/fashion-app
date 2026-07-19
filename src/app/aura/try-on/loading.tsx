import { Skeleton } from "@/components/ui/skeleton";

// Instant navigation feedback for `/aura/try-on`. The page is a Server Component
// that awaits auth, the Clerk user, and a portrait lookup before it can render,
// so without a Suspense fallback a click sits on the previous screen until all
// of that resolves (most visible in dev, where Link prefetch is disabled). This
// mirrors the surface's header + first stage so the swap to the real UI is calm.
export default function TryOnLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <header className="mb-6 grid gap-2 border-b pb-6">
        <h1 className="text-3xl font-medium tracking-tight text-balance">
          Try on a look
        </h1>
        <p className="text-muted-foreground text-pretty">
          Attach a garment image and see it worn on your AURA portrait. Nothing
          is uploaded or saved — your try-ons stay in this session.
        </p>
      </header>

      <section aria-hidden className="grid gap-3">
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-px flex-1" />
          <span className="text-muted-foreground text-xs">or paste a link</span>
          <Skeleton className="h-px flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </section>
    </main>
  );
}
