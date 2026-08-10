import { describe, expect, it } from "bun:test";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import {
  isPlanningConsentActive,
  isPlanningEgressAllowed,
  type PlanningConsentRecord,
} from "@/lib/planning-consent";

/**
 * Unit tests for the Smart Planning consent boundary gate. This is the check
 * every outside-contacting action (geocoding, weather, AI planning) runs
 * immediately before egress, so its truth table is the whole safety contract:
 * egress is permitted only for a not-withdrawn consent recorded under the
 * current policy version, and a stale version echoed by the client is refused.
 */

const CURRENT = 5; // an explicit "current" version, decoupled from the constant
const STALE = 4;

const active: PlanningConsentRecord = { policyVersion: CURRENT, withdrawnAt: null };
const withdrawn: PlanningConsentRecord = {
  policyVersion: CURRENT,
  withdrawnAt: new Date("2026-01-01T00:00:00Z"),
};
const staleVersion: PlanningConsentRecord = { policyVersion: STALE, withdrawnAt: null };

describe("isPlanningConsentActive", () => {
  it("is inactive when no consent has been recorded (absent)", () => {
    expect(isPlanningConsentActive(null, CURRENT)).toBe(false);
    expect(isPlanningConsentActive(undefined, CURRENT)).toBe(false);
  });

  it("is inactive once consent has been withdrawn", () => {
    expect(isPlanningConsentActive(withdrawn, CURRENT)).toBe(false);
  });

  it("is inactive when recorded under a superseded policy version (stale)", () => {
    expect(isPlanningConsentActive(staleVersion, CURRENT)).toBe(false);
  });

  it("is active only when not withdrawn and at the current version", () => {
    expect(isPlanningConsentActive(active, CURRENT)).toBe(true);
  });

  it("defaults the current version to PLANNING_POLICY_VERSION", () => {
    expect(
      isPlanningConsentActive({ policyVersion: PLANNING_POLICY_VERSION, withdrawnAt: null }),
    ).toBe(true);
    expect(
      isPlanningConsentActive({ policyVersion: PLANNING_POLICY_VERSION - 1, withdrawnAt: null }),
    ).toBe(false);
  });
});

describe("isPlanningEgressAllowed", () => {
  it("refuses when consent is absent, even with a current-version echo", () => {
    expect(isPlanningEgressAllowed(null, CURRENT, CURRENT)).toBe(false);
    expect(isPlanningEgressAllowed(undefined, CURRENT, CURRENT)).toBe(false);
  });

  it("refuses when consent has been withdrawn", () => {
    expect(isPlanningEgressAllowed(withdrawn, CURRENT, CURRENT)).toBe(false);
  });

  it("refuses when the stored consent's version is stale", () => {
    expect(isPlanningEgressAllowed(staleVersion, CURRENT, CURRENT)).toBe(false);
  });

  it("refuses a stale version echoed by the client, even with active consent", () => {
    expect(isPlanningEgressAllowed(active, STALE, CURRENT)).toBe(false);
  });

  it("permits egress only when active consent and a current-version echo agree", () => {
    expect(isPlanningEgressAllowed(active, CURRENT, CURRENT)).toBe(true);
  });

  it("defaults the current version to PLANNING_POLICY_VERSION", () => {
    const row: PlanningConsentRecord = {
      policyVersion: PLANNING_POLICY_VERSION,
      withdrawnAt: null,
    };
    expect(isPlanningEgressAllowed(row, PLANNING_POLICY_VERSION)).toBe(true);
    expect(isPlanningEgressAllowed(row, PLANNING_POLICY_VERSION - 1)).toBe(false);
  });
});
