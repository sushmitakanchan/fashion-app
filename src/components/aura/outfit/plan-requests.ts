import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import type { OutfitEdit, PlanResponse, PlanResult } from "./types";

/** One planner exchange: POST the event's plan with the echoed policy version
 *  and, for a week pass, the ids already committed to earlier events. Shared by
 *  the single-event action and the sequential week plan so the request contract
 *  can't drift between them. */
export async function requestPlan(
  eventId: string,
  priorItemIds: readonly string[],
): Promise<PlanResult> {
  const response = await fetch(`/api/aura/calendar/events/${eventId}/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION, priorItemIds }),
  });
  const body = (await response.json().catch(() => null)) as PlanResponse | null;
  if (response.status === 403 && body?.code === "consent-required") {
    return { consentRequired: true };
  }
  if (!response.ok || !body?.outfit) {
    return { error: body?.error ?? "Please try again." };
  }
  return { outfit: body.outfit };
}

/** Nudge an already-planned outfit inline (#178): Regenerate the whole pick or
 *  Swap one piece. Exclusion is applied server-side in the prompt (soft), so the
 *  result is a fresh outfit that flips provenance to `user_edited`. Like the
 *  initial plan, a withdrawn consent replies 403 so the caller can raise the
 *  disclosure and resume this exact edit on agreement. */
export async function requestReplan(
  eventId: string,
  edit: OutfitEdit,
): Promise<PlanResult> {
  const response = await fetch(`/api/aura/calendar/events/${eventId}/replan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION, ...edit }),
  });
  const body = (await response.json().catch(() => null)) as PlanResponse | null;
  if (response.status === 403 && body?.code === "consent-required") {
    return { consentRequired: true };
  }
  if (!response.ok || !body?.outfit) {
    return { error: body?.error ?? "Please try again." };
  }
  return { outfit: body.outfit };
}
