/**
 * `bun run wardrobe:expire` — permanently remove Wardrobe Items whose 30-day
 * recovery window has closed, along with both of their private media objects.
 *
 * A manual/ad-hoc runner for the terminal step of the recoverable-deletion
 * lifecycle; in production the same sweep runs on a schedule via Vercel Cron
 * (`vercel.json` → `GET /api/wardrobe/expire`). Both call the one idempotent,
 * retry-safe core in `src/lib/wardrobe-expiry.ts`, so a missed or repeated run
 * only delays or repeats removals, never corrupts them. This file is only the
 * wiring and output.
 *
 * Exits non-zero when any item could not be fully removed, so an operator (or a
 * CI invocation) surfaces a stuck run instead of silently leaving media behind.
 */
import { expireRecoveredWardrobeItems } from "@/lib/wardrobe-expiry";

const summary = await expireRecoveredWardrobeItems();

console.log(
  `Wardrobe expiry: examined ${summary.examined}, removed ${summary.removed.length}, failed ${summary.failed.length}.`,
);
for (const failure of summary.failed) {
  console.error(`  could not remove ${failure.id}: ${failure.error}`);
}

process.exit(summary.failed.length > 0 ? 1 : 0);
