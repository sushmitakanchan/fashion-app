"use client";

import * as React from "react";
import { CalendarCheck, CalendarSync, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  GoogleCalendarDisclosure,
  useGoogleCalendarConnect,
} from "@/components/aura/google-calendar-connect-flow";
import { formatSyncFreshness } from "@/lib/google-calendar-import";

type StatusResponse = {
  connected?: boolean;
  needsReconnect?: boolean;
  lastSyncedAt?: string | null;
};
type SyncResponse = {
  imported?: number;
  updated?: number;
  total?: number;
  lastSyncedAt?: string | null;
  error?: string;
  code?: string;
};

/** How often the freshness line re-reads the clock. The label is coarse (minutes
 *  at its finest), so a minute tick is enough to keep it honest on a calendar
 *  left open — without it, "synced just now" would still say so an hour later. */
const FRESHNESS_TICK_MS = 60_000;

/**
 * The read-only Google Calendar connect + sync affordance. Connecting is a
 * secondary, dismissible nudge (§9): its OAuth grant is its own consent, so —
 * unlike Smart Planning — there is no `PlanningConsent` here. The versioned
 * Google disclosure appears inline BEFORE the OAuth popup; agreeing starts
 * Clerk's OAuth passthrough (adding the `calendar.events.readonly` scope to the
 * existing Google connection, or creating one), which redirects to Google.
 *
 * Once connected, a Sync pulls upcoming events forward-only from today; a lost
 * scope (an ordinary Google sign-in resets Clerk's stored scopes) surfaces as a
 * Reconnect instead. The Google path can't run in Clerk keyless dev — the button
 * simply reports the sign-in isn't available there.
 */
export function GoogleCalendarConnect({
  startOfTodayIso,
  onSynced,
}: {
  startOfTodayIso: string | null;
  onSynced: () => void;
}) {
  const { isLoaded, connecting, beginConnect } =
    useGoogleCalendarConnect("/aura/calendar");
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [showDisclosure, setShowDisclosure] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  // Tick the clock the freshness line reads, but only while it is on screen.
  // Nothing renders before `status` lands, so this can't produce a server/client
  // mismatch — the label is client-only by construction.
  const connected = status?.connected === true;
  React.useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setNow(new Date()), FRESHNESS_TICK_MS);
    return () => clearInterval(id);
  }, [connected]);

  // Read the current connection status once after mount. This is an internal
  // read (Clerk state via our own route) — no calendar data is fetched.
  React.useEffect(() => {
    const controller = new AbortController();
    async function loadStatus() {
      try {
        const response = await fetch("/api/aura/calendar/google", {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as StatusResponse | null;
        if (!controller.signal.aborted && response.ok && body) setStatus(body);
      } catch {
        // A failed status read just leaves the nudge hidden — non-fatal.
      }
    }
    void loadStatus();
    return () => controller.abort();
  }, []);

  /** Pull upcoming events forward-only from today. Re-runnable — a re-sync
   *  updates by `externalId` rather than duplicating. */
  async function sync() {
    setSyncing(true);
    try {
      const response = await fetch("/api/aura/calendar/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          startOfTodayIso ? { startOfToday: startOfTodayIso } : {},
        ),
      });
      const body = (await response.json().catch(() => null)) as SyncResponse | null;

      if (response.status === 403 && body?.code === "reconnect-required") {
        // The stored scope was dropped — offer the connect flow again.
        setStatus({ connected: false, needsReconnect: true });
        setShowDisclosure(true);
        return;
      }
      if (!response.ok || !body) {
        toast.error("We couldn't sync your calendar", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }

      // Advance the freshness line off the route's own stamp. It reports the
      // sync moment even if the best-effort metadata write behind it failed, so
      // the label matches what actually happened to the events.
      setStatus((prior) => ({
        ...(prior ?? {}),
        connected: true,
        lastSyncedAt: body.lastSyncedAt ?? new Date().toISOString(),
      }));
      setNow(new Date());

      const total = body.total ?? 0;
      toast.success("Google Calendar synced", {
        description:
          total === 0
            ? "No upcoming events to import."
            : `${total} ${total === 1 ? "event" : "events"} up to date.`,
      });
      onSynced();
    } catch {
      toast.error("We couldn't sync your calendar", { description: "Please try again." });
    } finally {
      setSyncing(false);
    }
  }

  if (!isLoaded || !status) return null;

  // Connected: a quiet utility row, not a banner. It reports freshness rather
  // than connection state — "connected — read-only" already lives on the
  // settings card, and repeating it here framed the row as a success notice the
  // user expected to dismiss. What it can't get anywhere else is how stale the
  // import is, and nothing syncs automatically, so the control stays put.
  if (status.connected) {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
          <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
          {formatSyncFreshness(status.lastSyncedAt, now)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void sync()}
          disabled={syncing}
          className="text-muted-foreground hover:text-foreground -mr-2 h-auto px-2 py-1"
        >
          {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
    );
  }

  // Not connected: a dismissible nudge (or a reconnect prompt if the scope lapsed).
  if (dismissed) return null;
  const reconnect = status.needsReconnect === true;

  return (
    <>
      <div className="border-border bg-muted/40 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <CalendarSync className="text-brand-magenta mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">
              {reconnect ? "Reconnect Google Calendar" : "Import from Google Calendar"}
            </p>
            <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
              {reconnect
                ? "Your calendar access lapsed. Reconnect to keep importing your events (read-only)."
                : "Bring in your upcoming events without retyping them. Read-only — AURA never changes your calendar."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!reconnect ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDismissed(true)}
              className="rounded-full"
            >
              Not now
            </Button>
          ) : null}
          <Button
            type="button"
            variant="cta-flat"
            onClick={() => setShowDisclosure(true)}
            className="rounded-full"
          >
            {reconnect ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </div>

      {showDisclosure ? (
        <GoogleCalendarDisclosure
          connecting={connecting}
          onAgree={() => void beginConnect()}
          onCancel={() => setShowDisclosure(false)}
        />
      ) : null}
    </>
  );
}
