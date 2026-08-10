/**
 * Client-safe consent policy for AURA Smart Planning (the Outfit Calendar's
 * auto-plan pipeline). The disclosure text and its version live here — not in a
 * server-only boundary — so the opt-in UI, the consent route, and the egress
 * boundary all share one wording and one version without pulling any server
 * client into the browser bundle. Mirrors `wardrobe-analysis-policy.ts`.
 *
 * `PlanningConsent.policyVersion` is an Int in the schema, so the version here is
 * a number (not the date-string scheme wardrobe analysis uses).
 */

/** The policy version the disclosure below describes. Bump when its material
 *  terms change — that forces a fresh opt-in, since consent recorded under an
 *  older version is no longer active (see `isPlanningConsentActive`). */
export const PLANNING_POLICY_VERSION = 1;

/**
 * The one-time Smart Planning disclosure, shown before the first outside contact
 * (the first weather view on a placed event, or the first auto-plan). It names
 * the whole non-Google auto-plan pipeline — geocoding, weather, and AI — in one
 * place, and states the privacy invariant the pipeline is built around: your
 * event titles are stored but never leave the app. Google Calendar import is
 * governed separately by its own OAuth grant, not by this consent.
 */
export const SMART_PLANNING_DISCLOSURE =
  "Smart Planning is optional. If you turn it on, AURA contacts outside services " +
  "to plan your week: your event's place text and geocoded coordinates are sent " +
  "to Open-Meteo — a third-party service — to resolve the location and fetch the " +
  "weather, and your event's occasion, place, weather, and your wardrobe list are " +
  "sent to our AI provider to propose an outfit. Your event titles are never " +
  "sent — the planner works from occasion, place, and weather only. Consent " +
  "covers these three steps (geocoding, weather, AI); nothing is contacted until " +
  "you view a placed event's weather or ask AURA to plan, and you can withdraw " +
  "anytime — withdrawal only bars future planning and never touches events or " +
  "outfits you already have.";
