import { clerkMiddleware } from "@clerk/nextjs/server";

// In Next.js 16 the `middleware.ts` convention was renamed to `proxy.ts`
// (runs on the Node.js runtime by default). Clerk 7 detects either file.
//
// `clerkMiddleware()` wires Clerk into every matched request so that `auth()`
// works in Server Components, Route Handlers, and Server Actions. Following
// Clerk's current guidance we do NOT gate routes here (the `createRouteMatcher`
// approach is deprecated); instead each resource protects itself where it's
// accessed, e.g. `await auth.protect()` in src/app/dashboard/page.tsx.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
