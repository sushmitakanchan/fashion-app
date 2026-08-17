"use client";

import * as React from "react";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  GOOGLE_CALENDAR_DISCLOSURE,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_OAUTH_PROVIDER,
} from "@/lib/google-calendar-policy";
import { Button } from "@/components/ui/button";

/**
 * The shared "turn Google Calendar on" flow — the versioned disclosure plus the
 * Clerk OAuth passthrough that follows it. Both entry points use it: the
 * calendar's connect nudge and the settings toggle. Connecting is never a plain
 * state write (unlike disconnecting, which is), so a caller can't just POST —
 * it has to hand off to Google, and the disclosure must precede that handoff.
 */

/**
 * Start Clerk's OAuth passthrough, adding the read-only calendar scope to the
 * Google connection (creating one if absent). Redirects to Google on success and
 * back to `redirectPath` afterwards, so each entry point returns where it began.
 */
export function useGoogleCalendarConnect(redirectPath: string) {
  const { isLoaded, user } = useUser();
  const [connecting, setConnecting] = React.useState(false);

  const beginConnect = React.useCallback(async () => {
    if (!user) return;
    setConnecting(true);
    try {
      // Record the (re)connect intent before leaving for Google. If the user had
      // previously disconnected in-app, the Clerk-held token still carries the
      // scope, so this clears the disconnect flag now — otherwise the lingering
      // token would read as still-disconnected on return. Best-effort: a failure
      // here shouldn't block the OAuth flow.
      await fetch("/api/aura/calendar/google", { method: "PUT" }).catch(() => {});

      const redirectUrl = `${window.location.origin}${redirectPath}`;
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
  }, [redirectPath, user]);

  return { isLoaded, connecting, beginConnect };
}

/** The versioned, just-in-time Google disclosure, shown inline before the OAuth
 *  popup. Agreeing is what starts Google's own consent screen — the OAuth grant
 *  there is the consent, so nothing is recorded here. */
export function GoogleCalendarDisclosure({
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
