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

// The intent flag we persist in Clerk `publicMetadata` the first time we observe
// the calendar scope granted. It records that the user chose to connect
// calendar, so a later scope drop (an ordinary Google sign-in resets Clerk's
// stored scopes) reads as "reconnect" instead of a never-connected account. It
// carries the disclosure version they connected under, so a future material
// wording change is detectable (§7). `publicMetadata` is backend-writable only,
// and deep-merged so unrelated metadata is untouched.
type GoogleCalendarMetadata = { connectedAt: string; policyVersion: number };

function readGoogleIntent(publicMetadata: unknown): boolean {
  if (!publicMetadata || typeof publicMetadata !== "object") return false;
  const value = (publicMetadata as Record<string, unknown>).googleCalendar;
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).connectedAt === "string"
  );
}

/**
 * Record the connect intent (best-effort). Called the moment the scope is first
 * seen granted — the *grant* is when intent should be captured, not the first
 * sync, so a scope drop before any sync still reads as reconnect. A metadata
 * write failure is swallowed; it never fails the request that triggered it.
 */
async function recordConnectIntent(userId: string): Promise<void> {
  try {
    const client = await clerkClient();
    const metadata: GoogleCalendarMetadata = {
      connectedAt: new Date().toISOString(),
      policyVersion: GOOGLE_CALENDAR_POLICY_VERSION,
    };
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { googleCalendar: metadata },
    });
  } catch (error) {
    console.error("Recording Google Calendar connect intent failed", error);
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

async function readIntent(userId: string): Promise<boolean> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return readGoogleIntent(user.publicMetadata);
  } catch (error) {
    console.error("Reading Google Calendar intent failed", error);
    return false;
  }
}

function connectionStatus(scoped: boolean, intent: boolean) {
  return {
    connected: scoped,
    // Wanted calendar before, but the scope is gone → offer reconnect, not connect.
    needsReconnect: intent && !scoped,
  };
}

/** Report the caller's Google Calendar connection status. Pure read of Clerk
 *  state — no calendar data is fetched here. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ scoped }, hadIntent] = await Promise.all([
    resolveConnection(userId),
    readIntent(userId),
  ]);

  // Capture intent at grant-time: this GET runs on the calendar page load right
  // after the OAuth redirect, so recording it here (before any sync) means a
  // scope drop in between still surfaces as reconnect rather than a fresh connect.
  let intent = hadIntent;
  if (scoped && !hadIntent) {
    await recordConnectIntent(userId);
    intent = true;
  }
  return NextResponse.json(connectionStatus(scoped, intent));
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

  const connection = await resolveConnection(userId);
  if (!connection.token || !connection.scoped) {
    // No usable, calendar-scoped connection — start the (re)connect flow.
    return reconnectRequired(
      "Connect Google Calendar with read-only access to import your events.",
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
          select: { externalId: true, placeText: true },
        })
      : [];
    const priorByExternalId = new Map(
      existing.map((row) => [row.externalId, row]),
    );

    for (const record of records) {
      const prior = priorByExternalId.get(record.externalId);
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
  // (idempotent — usually already set by the status GET on page load).
  await recordConnectIntent(userId);

  return NextResponse.json({ imported, updated, total: imported + updated });
}
