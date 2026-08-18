import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { getOrProvisionUserId } from "@/lib/wardrobe-user";
import { DEFAULT_PLANNED_OCCASION, googleCalendarSyncSchema } from "@/lib/validations";
import {
  GOOGLE_CALENDAR_POLICY_VERSION,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_OAUTH_PROVIDER,
} from "@/lib/google-calendar-policy";
import { googleSyncWindow } from "@/lib/google-calendar-import";
import {
  GoogleCalendarError,
  listPrimaryCalendarEvents,
} from "@/lib/google-calendar";

/**
 * Read-only Google Calendar import via Clerk OAuth passthrough. Its OAuth grant
 * IS its consent — this path is independent of `PlanningConsent` (that gates the
 * Smart Planning egress; Google import touches only the user's own calendar and
 * our own database). Zero token storage: Clerk holds the Google refresh token
 * and mints an access token on demand here, which is used and discarded.
 *
 * - `GET`  reports whether a usable (calendar-scoped) connection exists, and
 *          whether a previously-connected account has since dropped the scope
 *          (an ordinary Google sign-in resets Clerk's stored scopes) so the UI
 *          can offer *reconnect* rather than a first connect.
 * - `POST` mints the token, lists primary-calendar events forward-only from
 *          start-of-today within a bounded lookahead (paginated, timed-vs-all-day
 *          branched, cancelled skipped — all in the pure mapper), and upserts
 *          them by `externalId` so a re-sync updates rather than duplicates.
 *          Imported events land unplanned and `source = google`.
 *
 * The Google path cannot be exercised in Clerk keyless dev (it needs real keys
 * plus the configured Google connection); the mapping logic is unit-tested in
 * `google-calendar-import.test.ts`.
 */

// The intent record we persist in Clerk `publicMetadata` the first time we
// observe the calendar scope granted. It records that the user chose to connect
// calendar, so a later scope drop (an ordinary Google sign-in resets Clerk's
// stored scopes) reads as "reconnect" instead of a never-connected account. It
// carries the disclosure version they connected under, so a future material
// wording change is detectable (§7). `disconnectedAt` records an explicit,
// forward-only in-app disconnect (§7): the Clerk-held token may linger (it is
// also the user's sign-in, so we never delete it), so this flag — not the token
// scope — is what makes a disconnect stick. `publicMetadata` is backend-writable
// only, and deep-merged, so we always write the whole record (with an explicit
// `disconnectedAt`, null when connected) to avoid a stale field surviving a merge.
// `lastSyncedAt` is the moment the last successful sync completed. It lives here
// rather than on the events themselves because it must survive a sync that
// imported nothing, and because "how fresh is this calendar" is a property of the
// connection, not of any one row. It is carried forward by every other writer
// (connect, reconnect, disconnect) — the whole-record write means an omitted
// field is a deletion, and a reconnect must not make an already-synced calendar
// look as if it had never been synced.
type GoogleCalendarMetadata = {
  connectedAt: string;
  policyVersion: number;
  disconnectedAt?: string | null;
  lastSyncedAt?: string | null;
};

function readGoogleMetadata(publicMetadata: unknown): GoogleCalendarMetadata | null {
  if (!publicMetadata || typeof publicMetadata !== "object") return null;
  const value = (publicMetadata as Record<string, unknown>).googleCalendar;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.connectedAt !== "string") return null;
  return {
    connectedAt: record.connectedAt,
    policyVersion:
      typeof record.policyVersion === "number"
        ? record.policyVersion
        : GOOGLE_CALENDAR_POLICY_VERSION,
    disconnectedAt:
      typeof record.disconnectedAt === "string" ? record.disconnectedAt : null,
    lastSyncedAt:
      typeof record.lastSyncedAt === "string" ? record.lastSyncedAt : null,
  };
}

/** Has the user ever connected calendar (regardless of a later disconnect)? */
function hasEverConnected(meta: GoogleCalendarMetadata | null): boolean {
  return meta !== null;
}

/** Has the user explicitly disconnected in-app? A disconnect is forward-only and
 *  survives a lingering scoped token until an explicit reconnect clears it. */
function isDisconnected(meta: GoogleCalendarMetadata | null): boolean {
  return !!meta && typeof meta.disconnectedAt === "string";
}

/**
 * Write the connect-intent record (best-effort). `disconnected` distinguishes the
 * two writers: recording a (re)connect clears any prior disconnect, while an
 * in-app disconnect sets it. The whole record is written each time (never a
 * partial merge) so a `disconnectedAt` can be reliably cleared as well as set. A
 * metadata write failure on the connect path is swallowed; it never fails the
 * request that triggered it. The disconnect path surfaces its failure to the
 * caller so the user learns their choice didn't take.
 *
 * `lastSyncedAt` is passed by every caller because the write is whole-record:
 * only the sync path advances it, everyone else hands back what they read.
 */
async function writeGoogleMetadata(
  userId: string,
  {
    connectedAt,
    disconnected,
    lastSyncedAt,
  }: { connectedAt: string; disconnected: boolean; lastSyncedAt: string | null },
): Promise<GoogleCalendarMetadata> {
  const client = await clerkClient();
  const metadata: GoogleCalendarMetadata = {
    connectedAt,
    policyVersion: GOOGLE_CALENDAR_POLICY_VERSION,
    disconnectedAt: disconnected ? new Date().toISOString() : null,
    lastSyncedAt,
  };
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { googleCalendar: metadata },
  });
  return metadata;
}

/** Record (or refresh) an active connect intent, clearing any prior disconnect.
 *  Best-effort — a write failure never fails the triggering request; the written
 *  record is returned so callers can report status without a second read (null
 *  when the best-effort write failed). `lastSyncedAt` is carried through
 *  unchanged; only the sync path passes a fresh stamp. */
async function recordConnectIntent(
  userId: string,
  lastSyncedAt: string | null,
): Promise<GoogleCalendarMetadata | null> {
  try {
    return await writeGoogleMetadata(userId, {
      connectedAt: new Date().toISOString(),
      disconnected: false,
      lastSyncedAt,
    });
  } catch (error) {
    console.error("Recording Google Calendar connect intent failed", error);
    return null;
  }
}

type ConnectionState = {
  /** A minted token carrying the read-only calendar scope is available. */
  scoped: boolean;
  /** The freshest access token, when one exists. Never persisted. */
  token: string | null;
};

/**
 * Mint the caller's Google access token through Clerk and report whether it
 * carries the calendar scope. Any failure — no Google connection, keyless dev,
 * a Clerk fault — resolves to the "no usable connection" state rather than
 * throwing, so a status read never 500s on an unconnected user.
 */
async function resolveConnection(userId: string): Promise<ConnectionState> {
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserOauthAccessToken(
      userId,
      GOOGLE_OAUTH_PROVIDER,
    );
    const entry = data[0];
    if (!entry?.token) return { scoped: false, token: null };
    const scopes = entry.scopes ?? [];
    return {
      scoped: scopes.includes(GOOGLE_CALENDAR_SCOPE),
      token: entry.token,
    };
  } catch (error) {
    console.error("Resolving Google Calendar connection failed", error);
    return { scoped: false, token: null };
  }
}

async function readMetadata(userId: string): Promise<GoogleCalendarMetadata | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return readGoogleMetadata(user.publicMetadata);
  } catch (error) {
    console.error("Reading Google Calendar intent failed", error);
    return null;
  }
}

function connectionStatus(scoped: boolean, meta: GoogleCalendarMetadata | null) {
  const disconnected = isDisconnected(meta);
  // A usable connection the user still wants: the token carries the scope AND
  // they haven't disconnected in-app (a lingering token after disconnect is
  // NOT "connected").
  const connected = scoped && !disconnected;
  return {
    connected,
    // Wanted calendar before, hasn't disconnected, but the scope is gone → offer
    // reconnect, not a first connect. A deliberate disconnect is a clean off
    // state (offer connect), never a reconnect.
    needsReconnect: hasEverConnected(meta) && !disconnected && !scoped,
    // Only meaningful while connected — the freshness line is rendered nowhere
    // else, so an off state reports null rather than a stale stamp.
    lastSyncedAt: connected ? (meta?.lastSyncedAt ?? null) : null,
  };
}

/** Report the caller's Google Calendar connection status. Pure read of Clerk
 *  state — no calendar data is fetched here. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ scoped }, meta] = await Promise.all([
    resolveConnection(userId),
    readMetadata(userId),
  ]);

  // Capture intent at grant-time: this GET runs on the calendar page load right
  // after the OAuth redirect, so recording it here (before any sync) means a
  // scope drop in between still surfaces as reconnect rather than a fresh connect.
  // Only auto-record for a never-connected account — once a record exists (incl.
  // an explicit disconnect) we respect it, so a disconnect isn't silently undone
  // by a lingering token on the next page load. Reconnecting is an explicit act
  // (PUT) that clears the disconnect flag.
  let current = meta;
  if (scoped && !hasEverConnected(meta)) {
    // Never-connected by definition, so there is no sync stamp to carry.
    current = (await recordConnectIntent(userId, null)) ?? meta;
  }
  return NextResponse.json(connectionStatus(scoped, current));
}

/**
 * Record an explicit (re)connect intent, clearing any prior in-app disconnect.
 * The client calls this the moment the user initiates a (re)connect — before the
 * OAuth redirect — so that when a previously-disconnected user reconnects, the
 * lingering scoped token immediately reads as connected again on return rather
 * than staying stuck behind the disconnect flag. Idempotent; safe on a first
 * connect too. Reports the resulting status.
 */
export async function PUT() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read first so the reconnect carries the existing sync stamp forward — the
  // imported events survive a disconnect, so their freshness should too.
  const [{ scoped }, prior] = await Promise.all([
    resolveConnection(userId),
    readMetadata(userId),
  ]);

  let written: GoogleCalendarMetadata;
  try {
    written = await writeGoogleMetadata(userId, {
      connectedAt: new Date().toISOString(),
      disconnected: false,
      lastSyncedAt: prior?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error("Recording Google Calendar reconnect intent failed", error);
    return NextResponse.json(
      { error: "We couldn't update your Google Calendar connection. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(connectionStatus(scoped, written));
}

const DISCONNECT_FAILED =
  "We couldn't disconnect Google Calendar. Please try again.";

/**
 * Disconnect Google Calendar — forward-only (§7). Future syncs stop; already-
 * imported events are kept (per-event hard-delete via the events route remains
 * the purge path). We only flip the in-app disconnect flag in Clerk metadata: we
 * never delete the Google external account, because it doubles as the user's
 * sign-in. Idempotent — disconnecting an already-disconnected or never-connected
 * account reports the (disconnected) status rather than erroring.
 */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ scoped }, meta] = await Promise.all([
    resolveConnection(userId),
    readMetadata(userId),
  ]);

  // Already off, or nothing to disconnect at all (never connected and no
  // lingering scoped token) — report the off state without a needless write.
  // A scoped-but-unrecorded token (a best-effort intent write earlier failed to
  // land) still gets a real disconnect below, so the card can't be left showing
  // "Connected" with a no-op button.
  if (isDisconnected(meta) || (!hasEverConnected(meta) && !scoped)) {
    return NextResponse.json(connectionStatus(scoped, meta));
  }

  let written: GoogleCalendarMetadata;
  try {
    written = await writeGoogleMetadata(userId, {
      // Preserve the original connect moment when we have one; a scoped-but-
      // unrecorded token has none, so stamp now.
      connectedAt: meta?.connectedAt ?? new Date().toISOString(),
      disconnected: true,
      // Kept so a later reconnect knows how stale the retained events are; it is
      // not reported while disconnected.
      lastSyncedAt: meta?.lastSyncedAt ?? null,
    });
  } catch (error) {
    console.error("Google Calendar disconnect failed", error);
    return NextResponse.json({ error: DISCONNECT_FAILED }, { status: 500 });
  }

  return NextResponse.json(connectionStatus(scoped, written));
}

const SYNC_FAILED = "We couldn't sync your Google Calendar. Please try again.";

/** A 403 the client branches on (`code`) to raise the disclosure and start the
 *  (re)connect flow — either the stored scope is missing, or Google declined. */
function reconnectRequired(message: string) {
  return NextResponse.json(
    { error: message, code: "reconnect-required" },
    { status: 403 },
  );
}

/** Trigger a forward-only sync of the primary calendar. */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = googleCalendarSyncSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [connection, meta] = await Promise.all([
    resolveConnection(userId),
    readMetadata(userId),
  ]);
  if (!connection.token || !connection.scoped) {
    // No usable, calendar-scoped connection — start the (re)connect flow.
    return reconnectRequired(
      "Connect Google Calendar with read-only access to import your events.",
    );
  }
  if (isDisconnected(meta)) {
    // The token still carries the scope, but the user disconnected in-app —
    // honour that (forward-only) and require an explicit reconnect first.
    return reconnectRequired(
      "Google Calendar is disconnected. Reconnect to import your events.",
    );
  }

  const startOfToday = parsed.data.startOfToday
    ? new Date(parsed.data.startOfToday)
    : new Date();
  const window = googleSyncWindow(startOfToday);

  let imported = 0;
  let updated = 0;

  try {
    const prisma = getPrisma();
    const ownerId = await getOrProvisionUserId(prisma, userId);
    if (!ownerId) {
      return NextResponse.json({ error: SYNC_FAILED }, { status: 500 });
    }

    const records = await listPrimaryCalendarEvents(connection.token, window);

    // Pre-read the events we're about to touch so a re-sync updates in place and
    // a changed place invalidates its cached geocode (weather re-resolves).
    const externalIds = records.map((record) => record.externalId);
    const existing = externalIds.length
      ? await prisma.plannedEvent.findMany({
          where: { userId: ownerId, externalId: { in: externalIds } },
          select: { externalId: true, placeText: true, source: true },
        })
      : [];
    const priorByExternalId = new Map(
      existing.map((row) => [row.externalId, row]),
    );

    for (const record of records) {
      const prior = priorByExternalId.get(record.externalId);
      // A Google event the owner has since edited was detached to `manual`
      // (keeping its externalId). Re-sync must not clobber those local edits —
      // skip it entirely, and don't count it as imported or updated.
      if (prior?.source === "manual") continue;
      const placeChanged =
        !prior || (prior.placeText ?? null) !== record.placeText;

      await prisma.plannedEvent.upsert({
        where: {
          userId_externalId: { userId: ownerId, externalId: record.externalId },
        },
        create: {
          userId: ownerId,
          source: "google",
          externalId: record.externalId,
          title: record.title,
          // Occasion is owner-entered/defaulted — never inferred from the Google
          // summary. Imports land with the generic default; the user can refine.
          occasion: DEFAULT_PLANNED_OCCASION,
          allDay: record.allDay,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          placeText: record.placeText,
        },
        update: {
          // Re-sync refreshes only the Google-owned fields; the user's occasion
          // and any planned outfit are left untouched (imports land unplanned,
          // and a re-sync must not clobber a plan the user built).
          title: record.title,
          allDay: record.allDay,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          placeText: record.placeText,
          ...(placeChanged
            ? { latitude: null, longitude: null, timezone: null, placeLabel: null }
            : {}),
        },
        select: { id: true },
      });

      if (prior) updated += 1;
      else imported += 1;
    }
  } catch (error) {
    if (error instanceof GoogleCalendarError) {
      if (error.kind === "unauthorized") {
        return reconnectRequired(
          "Google declined the request. Please reconnect your calendar.",
        );
      }
      return NextResponse.json(
        { error: "Google Calendar is unavailable right now. Please try again." },
        { status: 503 },
      );
    }
    console.error("Google Calendar sync failed", error);
    return NextResponse.json({ error: SYNC_FAILED }, { status: 500 });
  }

  // A successful sync proves the scope is granted; ensure the intent is on record
  // (idempotent — usually already set by the status GET on page load) and stamp
  // the freshness the UI reports. Best-effort like every other intent write: the
  // events did land, so a metadata failure must not fail the sync. It costs the
  // caller an accurate "synced just now" until the next successful write, which
  // is why the stamp is returned from our own clock rather than re-read.
  const syncedAt = new Date().toISOString();
  await recordConnectIntent(userId, syncedAt);

  return NextResponse.json({
    imported,
    updated,
    total: imported + updated,
    lastSyncedAt: syncedAt,
  });
}
