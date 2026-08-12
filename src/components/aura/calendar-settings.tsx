"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarX,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The Outfit Calendar's review/revoke settings surface (spec §7). It shows the
 * current state of the two outside-contact grants and lets the user undo them:
 *
 *  - **Smart Planning** — review the `PlanningConsent` state and revoke it. Revoke
 *    is forward-only: it bars future geocoding/weather/AI at the boundary gate
 *    while leaving existing outfits and events untouched.
 *  - **Google Calendar** — disconnect the read-only import. Also forward-only:
 *    future syncs stop while already-imported events are kept (per-event
 *    hard-delete on the calendar remains the purge path).
 *
 * This is the *review* surface, deliberately distinct from the just-in-time
 * grant surfaces (the Smart Planning disclosure and the Google connect nudge)
 * that live on the calendar. Granting/reconnecting happens there; this page only
 * reviews and undoes. Opening it is a pure read of our own state — no outside
 * contact.
 */

type ConsentResponse = {
  active?: boolean;
  consentedAt?: string | null;
  withdrawnAt?: string | null;
};

type GoogleResponse = { connected?: boolean; needsReconnect?: boolean };

type Loadable<T> = { status: "loading" } | { status: "ready"; data: T };

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function CalendarSettings() {
  const [consent, setConsent] = React.useState<Loadable<ConsentResponse>>({
    status: "loading",
  });
  const [google, setGoogle] = React.useState<Loadable<GoogleResponse>>({
    status: "loading",
  });
  const [revoking, setRevoking] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  // Read both grant states once after mount. Each is an internal read of our own
  // Clerk/DB state — no third-party contact — so the review surface stays
  // egress-free. A failed read falls back to a safe "off/not-connected" state.
  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [consentResult, googleResult] = await Promise.allSettled([
        fetch("/api/aura/calendar/consent", { signal: controller.signal }).then(
          (r) => (r.ok ? (r.json() as Promise<ConsentResponse>) : null),
        ),
        fetch("/api/aura/calendar/google", { signal: controller.signal }).then(
          (r) => (r.ok ? (r.json() as Promise<GoogleResponse>) : null),
        ),
      ]);
      if (controller.signal.aborted) return;
      setConsent({
        status: "ready",
        data:
          consentResult.status === "fulfilled" && consentResult.value
            ? consentResult.value
            : {},
      });
      setGoogle({
        status: "ready",
        data:
          googleResult.status === "fulfilled" && googleResult.value
            ? googleResult.value
            : {},
      });
    }
    void load();
    return () => controller.abort();
  }, []);

  /** Revoke Smart Planning consent — forward-only. Future geocoding/weather/AI is
   *  barred at the boundary gate; existing outfits and events are untouched. */
  async function revokeSmartPlanning() {
    setRevoking(true);
    try {
      const response = await fetch("/api/aura/calendar/consent", { method: "DELETE" });
      if (!response.ok) throw new Error("revoke failed");
      const body = (await response.json().catch(() => null)) as ConsentResponse | null;
      setConsent({ status: "ready", data: body ?? { active: false } });
      toast.success("Smart Planning turned off", {
        description:
          "Future planning won't contact any outside service. Your outfits and events are untouched.",
      });
    } catch {
      toast.error("We couldn't turn off Smart Planning", {
        description: "Please try again.",
      });
    } finally {
      setRevoking(false);
    }
  }

  /** Disconnect Google Calendar — forward-only. Future syncs stop; already-
   *  imported events are kept. */
  async function disconnectGoogle() {
    setDisconnecting(true);
    try {
      const response = await fetch("/api/aura/calendar/google", { method: "DELETE" });
      if (!response.ok) throw new Error("disconnect failed");
      const body = (await response.json().catch(() => null)) as GoogleResponse | null;
      setGoogle({ status: "ready", data: body ?? { connected: false } });
      toast.success("Google Calendar disconnected", {
        description:
          "We won't sync new events. Events you already imported are kept — delete them individually if you want them gone.",
      });
    } catch {
      toast.error("We couldn't disconnect Google Calendar", {
        description: "Please try again.",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-6 sm:py-10">
      <Link
        href="/aura/calendar"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to calendar
      </Link>

      <header className="mt-6">
        <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">
          Calendar settings
        </p>
        <h1 className="font-heading mt-2 text-4xl tracking-wide uppercase sm:text-5xl">
          Data &amp; connections
        </h1>
        <p className="text-muted-foreground mt-2 max-w-lg text-sm text-pretty">
          Review and undo the outside-contact grants that power the Outfit
          Calendar. Turning either off is forward-only — it stops future contact
          and never touches events or outfits you already have.
        </p>
      </header>

      <div className="mt-8 grid gap-5">
        <SmartPlanningCard
          state={consent}
          revoking={revoking}
          onRevoke={() => void revokeSmartPlanning()}
        />
        <GoogleCalendarCard
          state={google}
          disconnecting={disconnecting}
          onDisconnect={() => void disconnectGoogle()}
        />
      </div>
    </main>
  );
}

/** A shared card shell so the two grants read as one settings surface. */
function SettingsCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card text-card-foreground rounded-3xl border p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="text-brand-magenta" aria-hidden="true">
          {icon}
        </span>
        <h2 className="font-heading text-xl tracking-wide uppercase">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="bg-muted h-4 w-40 animate-pulse rounded" />
      <div className="bg-muted h-4 w-64 animate-pulse rounded" />
    </div>
  );
}

function SmartPlanningCard({
  state,
  revoking,
  onRevoke,
}: {
  state: Loadable<ConsentResponse>;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const active = state.status === "ready" && state.data.active === true;
  const consentedAt =
    state.status === "ready" ? formatWhen(state.data.consentedAt) : null;
  const withdrawnAt =
    state.status === "ready" ? formatWhen(state.data.withdrawnAt) : null;

  return (
    <SettingsCard
      icon={active ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
      title="Smart Planning"
    >
      {state.status === "loading" ? (
        <CardSkeleton />
      ) : active ? (
        <div className="flex flex-col gap-4">
          <div>
            <StatusPill tone="on">On</StatusPill>
            <p className="text-muted-foreground mt-3 text-sm text-pretty">
              AURA may contact Open-Meteo (to resolve places and fetch weather)
              and our AI provider (to plan outfits) when you view a placed event
              or ask it to plan. Your event titles are never sent.
              {consentedAt ? ` Turned on ${consentedAt}.` : ""}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={onRevoke}
              disabled={revoking}
              className="rounded-full"
            >
              {revoking ? <Loader2 className="animate-spin" /> : <ShieldOff />}
              {revoking ? "Turning off…" : "Turn off Smart Planning"}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs text-pretty">
              Forward-only: future planning is barred immediately. Outfits and
              events you already have stay exactly as they are.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusPill tone="off">Off</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            Smart Planning is off — nothing about your events leaves the app.
            {withdrawnAt ? ` Turned off ${withdrawnAt}.` : ""} You can turn it
            back on from the{" "}
            <Link
              href="/aura/calendar"
              className="hover:text-foreground underline underline-offset-2"
            >
              calendar
            </Link>{" "}
            the next time you view a placed event or plan an outfit.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

function GoogleCalendarCard({
  state,
  disconnecting,
  onDisconnect,
}: {
  state: Loadable<GoogleResponse>;
  disconnecting: boolean;
  onDisconnect: () => void;
}) {
  const connected = state.status === "ready" && state.data.connected === true;
  const needsReconnect =
    state.status === "ready" && state.data.needsReconnect === true;
  // Offer Disconnect whenever a grant is on record (connected, or scope-lapsed
  // but not yet disconnected). A clean "not connected" state has nothing to undo.
  const canDisconnect = connected || needsReconnect;

  return (
    <SettingsCard
      icon={connected ? <CalendarCheck className="size-5" /> : <CalendarX className="size-5" />}
      title="Google Calendar"
    >
      {state.status === "loading" ? (
        <CardSkeleton />
      ) : canDisconnect ? (
        <div className="flex flex-col gap-4">
          <div>
            <StatusPill tone={connected ? "on" : "off"}>
              {connected ? "Connected — read-only" : "Reconnect needed"}
            </StatusPill>
            <p className="text-muted-foreground mt-3 text-sm text-pretty">
              {connected
                ? "AURA imports your upcoming events (read-only) so you can plan outfits for them. It can never change your calendar."
                : "Your calendar access lapsed. You can reconnect from the calendar, or disconnect to stop importing entirely."}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={onDisconnect}
              disabled={disconnecting}
              className="rounded-full"
            >
              {disconnecting ? <Loader2 className="animate-spin" /> : <CalendarX />}
              {disconnecting ? "Disconnecting…" : "Disconnect Google Calendar"}
            </Button>
            <p className="text-muted-foreground mt-2 text-xs text-pretty">
              Forward-only: future syncs stop. Events you already imported are
              kept — delete them individually on the calendar to remove them.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusPill tone="off">Not connected</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            Google Calendar isn&apos;t connected. You can connect it (read-only)
            from the{" "}
            <Link
              href="/aura/calendar"
              className="hover:text-foreground underline underline-offset-2"
            >
              calendar
            </Link>{" "}
            to import your upcoming events.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "on" | "off";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ${
        tone === "on"
          ? "bg-brand-magenta/10 text-brand-magenta"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          tone === "on" ? "bg-brand-magenta" : "bg-muted-foreground/60"
        }`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
