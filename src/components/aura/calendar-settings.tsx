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

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SmartPlanningDisclosure } from "@/components/aura/smart-planning-disclosure";
import {
  GoogleCalendarDisclosure,
  useGoogleCalendarConnect,
} from "@/components/aura/google-calendar-connect-flow";

/**
 * The Outfit Calendar's settings surface (spec §7). It shows the current state of
 * the two outside-contact grants and lets the user turn each one on or off:
 *
 *  - **Smart Planning** — a `PlanningConsent` toggle. Turning it off is
 *    forward-only: it bars future geocoding/weather/AI at the boundary gate while
 *    leaving existing outfits and events untouched. Turning it *on* raises the
 *    same versioned disclosure the calendar shows, because consent is only
 *    recorded against a policy version the user was actually shown.
 *  - **Google Calendar** — the read-only import. Off is a plain state write, also
 *    forward-only (future syncs stop, already-imported events are kept). On is
 *    not a state write at all: it hands off to Clerk's OAuth passthrough and
 *    leaves the page for Google, so the switch starts that flow rather than
 *    flipping anything itself.
 *
 * Both grant paths reuse the calendar's own disclosure components, so this page
 * can never disclose different terms than the just-in-time prompts do. Opening
 * the page is a pure read of our own state — no outside contact.
 */

type ConsentResponse = {
  active?: boolean;
  consentedAt?: string | null;
  withdrawnAt?: string | null;
  error?: string;
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
  const [planningBusy, setPlanningBusy] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [showPlanningDisclosure, setShowPlanningDisclosure] = React.useState(false);
  const [showGoogleDisclosure, setShowGoogleDisclosure] = React.useState(false);

  // Come back here, not to the calendar, once Google is done with us.
  const {
    isLoaded: clerkLoaded,
    connecting,
    beginConnect,
  } = useGoogleCalendarConnect("/aura/calendar/settings");

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

  /** Record Smart Planning consent for the version the disclosure just showed.
   *  The route refuses a stale version rather than silently recording consent to
   *  terms the user didn't read. */
  async function grantSmartPlanning() {
    setPlanningBusy(true);
    try {
      const response = await fetch("/api/aura/calendar/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION }),
      });
      const body = (await response.json().catch(() => null)) as ConsentResponse | null;
      if (!response.ok || !body?.active) {
        toast.error("We couldn't turn on Smart Planning", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      setConsent({ status: "ready", data: body });
      setShowPlanningDisclosure(false);
      toast.success("Smart Planning turned on", {
        description:
          "AURA can now fetch the weather for placed events and plan outfits when you ask.",
      });
    } catch {
      toast.error("We couldn't turn on Smart Planning", {
        description: "Please try again.",
      });
    } finally {
      setPlanningBusy(false);
    }
  }

  /** Revoke Smart Planning consent — forward-only. Future geocoding/weather/AI is
   *  barred at the boundary gate; existing outfits and events are untouched. */
  async function revokeSmartPlanning() {
    setPlanningBusy(true);
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
      setPlanningBusy(false);
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
          Turn the outside-contact grants that power the Outfit Calendar on or
          off. Turning either off is forward-only — it stops future contact and
          never touches events or outfits you already have.
        </p>
      </header>

      <div className="mt-8 grid gap-5">
        <SmartPlanningCard
          state={consent}
          busy={planningBusy}
          onToggle={(next) =>
            next ? setShowPlanningDisclosure(true) : void revokeSmartPlanning()
          }
        />
        <GoogleCalendarCard
          state={google}
          busy={disconnecting || connecting}
          canConnect={clerkLoaded}
          onToggle={(next) =>
            next ? setShowGoogleDisclosure(true) : void disconnectGoogle()
          }
          onDisconnect={() => void disconnectGoogle()}
        />
      </div>

      {showPlanningDisclosure ? (
        <SmartPlanningDisclosure
          onAgree={() => void grantSmartPlanning()}
          onCancel={() => setShowPlanningDisclosure(false)}
        />
      ) : null}
      {showGoogleDisclosure ? (
        <GoogleCalendarDisclosure
          connecting={connecting}
          onAgree={() => void beginConnect()}
          onCancel={() => setShowGoogleDisclosure(false)}
        />
      ) : null}
    </main>
  );
}

/** A shared card shell so the two grants read as one settings surface. The
 *  switch sits in the header, opposite the title it acts on. */
function SettingsCard({
  icon,
  title,
  control,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  control: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card text-card-foreground rounded-3xl border p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-brand-magenta" aria-hidden="true">
            {icon}
          </span>
          <h2 className="font-heading text-xl tracking-wide uppercase">{title}</h2>
        </div>
        {control}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The card's on/off control: the switch, with a spinner while a flip is in
 *  flight so a slow round-trip doesn't read as an unresponsive toggle. */
function ToggleControl({
  label,
  checked,
  busy,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      {busy ? (
        <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
      ) : null}
      <Switch
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled || busy}
        aria-label={label}
        // The card already says "on" in magenta (pill and icon); the switch is
        // the third signal, so it matches rather than falling back to the
        // theme's default fill (lime in dark, ink in light).
        className="data-checked:bg-brand-magenta"
      />
    </span>
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
  busy,
  onToggle,
}: {
  state: Loadable<ConsentResponse>;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  const loading = state.status === "loading";
  const active = state.status === "ready" && state.data.active === true;
  const consentedAt =
    state.status === "ready" ? formatWhen(state.data.consentedAt) : null;
  const withdrawnAt =
    state.status === "ready" ? formatWhen(state.data.withdrawnAt) : null;

  return (
    <SettingsCard
      icon={active ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}
      title="Smart Planning"
      control={
        <ToggleControl
          label="Smart Planning"
          checked={active}
          busy={busy}
          disabled={loading}
          onToggle={onToggle}
        />
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : active ? (
        <div className="flex flex-col gap-3">
          <StatusPill tone="on">On</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            AURA may contact Open-Meteo (to resolve places and fetch weather) and
            our AI provider (to plan outfits) when you view a placed event or ask
            it to plan. Your event titles are never sent.
            {consentedAt ? ` Turned on ${consentedAt}.` : ""}
          </p>
          <p className="text-muted-foreground text-xs text-pretty">
            Turning it off is forward-only: future planning is barred immediately.
            Outfits and events you already have stay exactly as they are.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusPill tone="off">Off</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            Smart Planning is off — nothing about your events leaves the app.
            {withdrawnAt ? ` Turned off ${withdrawnAt}.` : ""}{" "}
            Turn it back on here (we&apos;ll show you what gets sent first), or
            the next time you view a placed event or plan an outfit on the{" "}
            <Link
              href="/aura/calendar"
              className="hover:text-foreground underline underline-offset-2"
            >
              calendar
            </Link>
            .
          </p>
        </div>
      )}
    </SettingsCard>
  );
}

function GoogleCalendarCard({
  state,
  busy,
  canConnect,
  onToggle,
  onDisconnect,
}: {
  state: Loadable<GoogleResponse>;
  busy: boolean;
  canConnect: boolean;
  onToggle: (next: boolean) => void;
  onDisconnect: () => void;
}) {
  const loading = state.status === "loading";
  const connected = state.status === "ready" && state.data.connected === true;
  const needsReconnect =
    state.status === "ready" && state.data.needsReconnect === true;

  return (
    <SettingsCard
      icon={connected ? <CalendarCheck className="size-5" /> : <CalendarX className="size-5" />}
      title="Google Calendar"
      control={
        <ToggleControl
          label="Google Calendar"
          checked={connected}
          busy={busy}
          // Turning it on needs Clerk loaded (the OAuth handoff runs on the
          // user object); turning it off is just our own state write.
          disabled={loading || (!connected && !canConnect)}
          onToggle={onToggle}
        />
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : connected ? (
        <div className="flex flex-col gap-3">
          <StatusPill tone="on">Connected — read-only</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            AURA imports your upcoming events (read-only) so you can plan outfits
            for them. It can never change your calendar.
          </p>
          <p className="text-muted-foreground text-xs text-pretty">
            Turning it off is forward-only: future syncs stop. Events you already
            imported are kept — delete them individually on the calendar to
            remove them.
          </p>
        </div>
      ) : needsReconnect ? (
        // A grant is still on record but the scope lapsed, so the switch reads
        // off while there is something left to undo. Keep an explicit disconnect
        // alongside it — otherwise the only way out is to reconnect first.
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <StatusPill tone="off">Reconnect needed</StatusPill>
            <p className="text-muted-foreground text-sm text-pretty">
              Your calendar access lapsed — an ordinary Google sign-in can reset
              it. Switch it back on to reconnect, or disconnect to stop importing
              entirely.
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={onDisconnect}
              disabled={busy}
              className="rounded-full"
            >
              <CalendarX />
              Disconnect Google Calendar
            </Button>
            <p className="text-muted-foreground mt-2 text-xs text-pretty">
              Forward-only: events you already imported are kept — delete them
              individually on the calendar to remove them.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusPill tone="off">Not connected</StatusPill>
          <p className="text-muted-foreground text-sm text-pretty">
            Google Calendar isn&apos;t connected. Switch it on to import your
            upcoming events (read-only) — we&apos;ll show you what that covers,
            then hand off to Google to sign in.
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
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ${
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
