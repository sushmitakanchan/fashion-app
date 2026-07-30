import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { expireRecoveredWardrobeItems } from "@/lib/wardrobe-expiry";

/**
 * Scheduled endpoint that runs the recovery-window expiry sweep — the terminal
 * step of the recoverable-deletion lifecycle. Invoked by Vercel Cron (see
 * `vercel.json`), which issues a GET carrying the shared `CRON_SECRET` as a
 * Bearer token; this is a system operation, not a user request, so it never
 * touches Clerk auth.
 *
 * When no secret is configured the endpoint is closed — every caller is refused
 * rather than the sweep being left open to the public. The work itself is
 * idempotent and retry-safe (see `@/lib/wardrobe-expiry`), so a missed or
 * repeated firing is harmless.
 */
function isAuthorizedCron(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await expireRecoveredWardrobeItems();
    // A run that couldn't fully remove every item is surfaced as a 500 so the
    // scheduler flags it, while still returning the summary of what did happen.
    const status = summary.failed.length > 0 ? 500 : 200;
    return NextResponse.json(summary, { status });
  } catch (error) {
    console.error("Wardrobe expiry sweep failed", error);
    return NextResponse.json(
      { error: "Wardrobe expiry sweep failed." },
      { status: 500 },
    );
  }
}
