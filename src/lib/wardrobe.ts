import { WARDROBE_MAX_ACTIVE_ITEMS } from "@/lib/validations";

export const wardrobeCategories = [
  "all",
  "tops",
  "bottoms",
  "dresses",
  "activewear",
  "outerwear",
  "bags",
  "shoes",
  "accessories",
] as const;

export type WardrobeCategory = (typeof wardrobeCategories)[number];
export type WardrobeItemCategory = Exclude<WardrobeCategory, "all">;

/** Root Cloudinary folder for every participant's private wardrobe media. */
export const WARDROBE_MEDIA_FOLDER = "fashion-app/wardrobe";

/** A recoverably deleted item remains restorable for this many calendar days. */
export const WARDROBE_RECOVERY_WINDOW_DAYS = 30;

export function wardrobeRecoveryExpiry(deletedAt: Date): Date {
  const expiry = new Date(deletedAt);
  expiry.setDate(expiry.getDate() + WARDROBE_RECOVERY_WINDOW_DAYS);
  return expiry;
}

/**
 * The per-owner media folder. `ownerKey` is the participant's Clerk id, so the
 * folder path itself encodes ownership — which is what lets a save re-validate
 * that a client-echoed media id belongs to the caller. Pure and Cloudinary-free
 * on purpose: it is the one place the "media id ⇒ owner" rule lives, and the
 * write boundary must be able to import it without mocking image delivery.
 */
export function wardrobeMediaFolder(ownerKey: string): string {
  return `${WARDROBE_MEDIA_FOLDER}/${ownerKey}`;
}

/**
 * Whether a Cloudinary media id sits under a given owner's wardrobe folder. The
 * batch-save boundary trusts nothing a client echoes back from import until this
 * holds, so a caller can never attach another participant's — or an arbitrary —
 * asset to their own Wardrobe Item.
 */
export function isOwnedWardrobeMediaId(mediaId: string, ownerKey: string): boolean {
  return mediaId.startsWith(`${wardrobeMediaFolder(ownerKey)}/`);
}

/**
 * Whether adding `addCount` items to an account already holding `activeCount`
 * active ones would break the ceiling. The single rule shared by the import
 * pre-check and the authoritative save boundary, so the two can't disagree.
 */
export function exceedsActiveItemLimit(activeCount: number, addCount: number): boolean {
  return activeCount + addCount > WARDROBE_MAX_ACTIVE_ITEMS;
}

/** The 409 body both wardrobe write routes return when a batch won't fit. */
export function wardrobeCapacityErrorBody(activeCount: number) {
  return {
    error: `Your wardrobe holds up to ${WARDROBE_MAX_ACTIVE_ITEMS} items. Delete some before adding more.`,
    activeCount,
    limit: WARDROBE_MAX_ACTIVE_ITEMS,
  };
}

/**
 * Whether a stored analysis-consent record still authorises analysis. Active
 * means: a record exists, it hasn't been withdrawn, and it was granted under the
 * policy version currently in force — a bumped policy silently deactivates old
 * consent, forcing a fresh opt-in. Pure and shared by the consent and analyze
 * routes so the "is consent active" rule lives in exactly one place.
 */
export function isWardrobeAnalysisConsentActive(
  consent: { policyVersion: string; withdrawnAt: Date | null } | null | undefined,
  currentPolicyVersion: string,
): boolean {
  return (
    !!consent &&
    consent.withdrawnAt === null &&
    consent.policyVersion === currentPolicyVersion
  );
}
