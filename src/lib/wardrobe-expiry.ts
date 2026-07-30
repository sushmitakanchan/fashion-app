// Deliberately no `import "server-only"`: like the healthcheck lib, this module
// is consumed by a standalone Bun entry point (`scripts/expire-wardrobe-media.ts`)
// as well as the server, and the `server-only` guard throws under `bun run`. It
// is a server module by discipline — nothing client-side may import it.
import { getPrisma } from "@/lib/prisma";
import { destroyWardrobeMedia } from "@/lib/wardrobe-media";

/** One recoverably deleted item whose window has closed, with just the fields
 * the permanent removal needs: the record id and both private media ids. */
type ExpiredWardrobeItem = {
  id: string;
  originalMediaId: string;
  normalizedMediaId: string;
};

export type WardrobeExpirySummary = {
  /** How many expired items this run found. */
  examined: number;
  /** Ids fully removed — both media objects and the record gone. */
  removed: string[];
  /** Items left intact for a later run, with why they couldn't be removed. */
  failed: { id: string; error: string }[];
};

/**
 * Permanently remove every Wardrobe Item whose 30-day recovery window has
 * closed, together with both of its private media objects. This is the terminal
 * step of the recoverable-deletion lifecycle: run it on a schedule (see
 * `scripts/expire-wardrobe-media.ts`).
 *
 * Two properties make it safe to retry, which a scheduled job must assume:
 *
 * - **Selection is conservative.** Only items with a deletion time *and* an
 *   elapsed recovery expiry are chosen, so an active or still-recoverable item
 *   is never removed no matter how often this runs.
 * - **Media are destroyed before the record.** If the process dies between the
 *   two, the record still selects on the next run and the idempotent
 *   {@link destroyWardrobeMedia} finds the objects already gone. The reverse
 *   order could drop the only reference to the media ids and orphan the objects.
 *
 * One item's failure is isolated: its record is left intact and reported, and
 * the rest of the batch still completes.
 */
export async function expireRecoveredWardrobeItems({
  now = new Date(),
}: { now?: Date } = {}): Promise<WardrobeExpirySummary> {
  const expired: ExpiredWardrobeItem[] = await getPrisma().wardrobeItem.findMany({
    where: { deletedAt: { not: null }, recoveryExpiresAt: { lte: now } },
    select: { id: true, originalMediaId: true, normalizedMediaId: true },
  });

  const removed: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const item of expired) {
    try {
      await Promise.all([
        destroyWardrobeMedia(item.originalMediaId),
        destroyWardrobeMedia(item.normalizedMediaId),
      ]);
      await getPrisma().wardrobeItem.delete({ where: { id: item.id } });
      removed.push(item.id);
    } catch (error) {
      failed.push({
        id: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { examined: expired.length, removed, failed };
}
