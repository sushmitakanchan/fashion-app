/**
 * Client-safe policy for the read-only Google Calendar import. Like
 * `planning-policy.ts`, the disclosure text and its version live in a plain
 * module so the opt-in UI, the sync route, and any status read all share one
 * wording and one version without pulling a server client into the browser
 * bundle.
 *
 * Google import is governed by ITS OWN OAuth grant, not by `PlanningConsent`:
 * granting the calendar scope in Google's own consent screen *is* the consent.
 * This disclosure is the just-in-time notice shown inline BEFORE that OAuth
 * popup — it explains what we read and store, not a separate consent record.
 */

/**
 * The single OAuth scope the import requests — the narrower, easier-to-justify
 * sensitive scope (read events only, no write, no full-calendar metadata). Used
 * client-side as the `additionalScopes` value on reauthorize/create, and
 * server-side to confirm the minted token actually carries it.
 */
export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

/** The Clerk external-account provider slug for Google. */
export const GOOGLE_OAUTH_PROVIDER = "google";

/**
 * The version the disclosure below describes. Bump when its material terms
 * change — a wording change re-prompts the just-in-time disclosure before the
 * next connect. (Google import stores no consent row, so this version gates the
 * UI notice only, unlike `PLANNING_POLICY_VERSION` which gates egress.)
 */
export const GOOGLE_CALENDAR_POLICY_VERSION = 1;

/**
 * The just-in-time Google disclosure, shown inline before the OAuth popup. It
 * states the four things §7 requires: the access is read-only, exactly what we
 * read, that imported events are stored in AURA, and that Clerk (not AURA) holds
 * the Google token. It also draws the boundary to Smart Planning — connecting
 * Google imports events but never, on its own, contacts a planning service.
 */
export const GOOGLE_CALENDAR_DISCLOSURE =
  "Connecting Google Calendar is optional and read-only — AURA can see your " +
  "events but can never create, edit, or delete anything on your calendar. " +
  "We read only your upcoming events (their title, time, and location) from " +
  "today forward, and store them in AURA as planned events you can then plan " +
  "outfits for. Your Google sign-in is handled by Clerk, our authentication " +
  "provider: Clerk holds the access token and AURA never stores it. Importing " +
  "events doesn't plan anything or contact any outside service on its own — you " +
  "stay in control of that. You can disconnect Google Calendar at any time; " +
  "disconnecting stops future syncs and leaves already-imported events in place.";
