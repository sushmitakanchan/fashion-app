"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { CalendarCheck, CalendarSync, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  GOOGLE_CALENDAR_DISCLOSURE,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_OAUTH_PROVIDER,
} from "@/lib/google-calendar-policy";
import { Button } from "@/components/ui/button";

type StatusResponse = { connected?: boolean; needsReconnect?: boolean };
type SyncResponse = { imported?: number; updated?: number; total?: number; error?: string; code?: string };

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
  const { isLoaded, user } = useUser();
  const [status, setStatus] = React.useState<StatusResponse | null>(null);
  const [dismissed, setDismissed] = React.useState(false);
  const [showDisclosure, setShowDisclosure] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

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

  /** Start Clerk's OAuth passthrough, adding the read-only calendar scope to the
   *  Google connection (creating one if absent). Redirects to Google on success. */
  async function beginConnect() {
    if (!user) return;
    setConnecting(true);
    try {
      const redirectUrl = `${window.location.origin}/aura/calendar`;
      const google = user.externalAccounts.find(
        (account) => account.provider === GOOGLE_OAUTH_PROVIDER,
      );
      const external = google
        ? await google.reauthorize({
            additionalScopes: [GOOGLE_CALENDAR_SCOPE],
            redirectUrl,
          })
        : await user.createExternalAccount({
            // `GOOGLE_OAUTH_PROVIDER` is the literal "google", so this is the
            // `"oauth_google"` literal type — assignable to Clerk's OAuthStrategy
            // without a cast or a type import (@clerk/types isn't installed).
            strategy: `oauth_${GOOGLE_OAUTH_PROVIDER}`,
            additionalScopes: [GOOGLE_CALENDAR_SCOPE],
            redirectUrl,
          });

      const target = external.verification?.externalVerificationRedirectURL;
      if (target) {
        window.location.href = target.toString();
        return; // leaving the page — keep the spinner up
      }
      toast.error("We couldn't start Google sign-in", {
        description: "Please try again.",
      });
    } catch {
      // Keyless dev (no real Clerk keys) and a declined popup both land here.
      toast.error("We couldn't connect Google Calendar", {
        description: "Google sign-in isn't available in this environment.",
      });
    } finally {
      setConnecting(false);
    }
  }

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

  // Connected: a compact Sync control.
  if (status.connected) {
    return (
      <div className="border-border bg-muted/30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
        <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
          <CalendarCheck className="text-brand-magenta size-4" aria-hidden="true" />
          Google Calendar connected — read-only
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void sync()}
          disabled={syncing}
          className="rounded-full"
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

/** The versioned, just-in-time Google disclosure, shown inline before the OAuth
 *  popup. Agreeing is what starts Google's own consent screen — the OAuth grant
 *  there is the consent, so nothing is recorded here. */
function GoogleCalendarDisclosure({
  connecting,
  onAgree,
  onCancel,
}: {
  connecting: boolean;
  onAgree: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="bg-brand-ink/35 fixed inset-0 z-50 grid place-items-end p-3 backdrop-blur-sm sm:place-items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-calendar-disclosure-title"
        className="bg-card text-card-foreground w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-7"
      >
        <h2
          id="google-calendar-disclosure-title"
          className="font-heading text-2xl tracking-wide uppercase"
        >
          Connect Google Calendar
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
          {GOOGLE_CALENDAR_DISCLOSURE}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={connecting}>
            Cancel
          </Button>
          <Button type="button" onClick={onAgree} disabled={connecting}>
            {connecting ? (
              <>
                <Loader2 className="animate-spin" />
                Connecting…
              </>
            ) : (
              "Continue with Google"
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
