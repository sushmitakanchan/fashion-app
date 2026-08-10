import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";

/**
 * The Smart Planning consent boundary gate. Every outside-contacting step of the
 * auto-plan pipeline — geocoding (place text), weather (coordinates), and AI
 * planning (occasion + place + weather + wardrobe) — re-checks this immediately
 * before egress. It is pure logic (a consent row in, a boolean out) so the
 * egress routes can own the Prisma lookup and this stays trivially testable.
 * Mirrors `isWardrobeAnalysisConsentActive`; the version is an Int here to match
 * the `PlanningConsent` schema.
 */

/** The stored consent fact the gate reads: the policy version consent was
 *  recorded under, and whether it has since been withdrawn. */
export type PlanningConsentRecord = {
  policyVersion: number;
  withdrawnAt: Date | null;
};

/**
 * Is a stored `PlanningConsent` active? Active ⟺ a row exists, it hasn't been
 * withdrawn, and it was recorded under the current policy version. Consent
 * recorded under a superseded disclosure is inactive until re-granted — a
 * material wording change bumps `PLANNING_POLICY_VERSION` and forces a fresh
 * opt-in. The consent route reads this to report state; the egress gate below
 * builds on it.
 */
export function isPlanningConsentActive(
  consent: PlanningConsentRecord | null | undefined,
  currentPolicyVersion: number = PLANNING_POLICY_VERSION,
): boolean {
  return (
    !!consent &&
    consent.withdrawnAt === null &&
    consent.policyVersion === currentPolicyVersion
  );
}

/**
 * The gate called immediately before any Smart Planning egress. Egress is
 * permitted only when the stored consent is active AND the caller echoes back
 * the exact policy version it disclosed. A stale echo — the client acted on an
 * older disclosure than the one now in force — is refused even when an active
 * consent row happens to exist, so a wording change always re-prompts before the
 * next outside contact. Event titles are never part of any gated payload; this
 * gate governs the pipeline that must not send them.
 */
export function isPlanningEgressAllowed(
  consent: PlanningConsentRecord | null | undefined,
  echoedPolicyVersion: number,
  currentPolicyVersion: number = PLANNING_POLICY_VERSION,
): boolean {
  if (echoedPolicyVersion !== currentPolicyVersion) return false;
  return isPlanningConsentActive(consent, currentPolicyVersion);
}
