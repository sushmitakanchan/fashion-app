"use client";

import * as React from "react";
import Link from "next/link";
import {
  Controller,
  useForm,
  useWatch,
  type ControllerRenderProps,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  DEFAULT_PLANNED_OCCASION,
  plannedEventFormSchema,
  type PlannedEventFormInput,
} from "@/lib/validations";
import {
  planWeekSequentially,
  type PlannedOutfitDto,
} from "@/lib/aura-outfit-planner";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import {
  civilDateInTimeZone,
  civilToUtcNoon,
  eventCivilDate,
  isPastDate,
  weekDates,
  weekInstantRange,
  weekStartFor,
  type CivilDate,
} from "@/lib/calendar-week";
import { shortPlaceLabel } from "@/lib/calendar-place";
import { findClashes } from "@/lib/calendar-clash";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DayHighLow,
  EventWeather,
  TicketField,
} from "@/components/aura/event-weather";
import { SmartPlanningDisclosure } from "@/components/aura/smart-planning-disclosure";
import { GoogleCalendarConnect } from "@/components/aura/google-calendar-connect";
import { OutfitItemTile, requestPlan } from "@/components/aura/outfit";

export type PlannedEventDto = {
  id: string;
  title: string;
  occasion: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  placeText: string | null;
  source: "manual" | "google";
  outfit: PlannedOutfitDto | null;
};

type EventsResponse = { events?: PlannedEventDto[]; error?: string };
type EventResponse = { event?: PlannedEventDto; error?: string };

// Civil-date formatters are anchored to UTC noon (via `civilToUtcNoon`) and read
// back with `timeZone: "UTC"`, so the label matches the civil date exactly,
// independent of the viewer's timezone. Event *times*, by contrast, format the
// absolute instant in the viewer's local zone.
const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  timeZone: "UTC",
});
const dayNumFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  timeZone: "UTC",
});
const rangeStartFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const rangeEndFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
// 12-hour throughout: the ticket reads its clock in am/pm, and the day rail
// splits the two apart so the hour can carry the display face on its own.
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatEventTime(event: PlannedEventDto): string {
  if (event.allDay) return "All day";
  const start = timeFmt.format(new Date(event.startsAt));
  if (event.endsAt) {
    return `${start} – ${timeFmt.format(new Date(event.endsAt))}`;
  }
  return start;
}

/** The start time split for the day rail: `9:00` over a separate `am`. All-day
 *  events have no clock, so the rail carries the words instead. */
function railTime(event: PlannedEventDto): { clock: string; meridiem: string } {
  if (event.allDay) return { clock: "All", meridiem: "day" };
  // A 12-hour format is "9:00 AM" in every locale that has one; anything the
  // browser hands back without a trailing marker falls through as clock-only.
  const parts = timeFmt.formatToParts(new Date(event.startsAt));
  const meridiem = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const clock = parts
    .filter((part) => part.type === "hour" || part.type === "literal" || part.type === "minute")
    .map((part) => part.value)
    .join("")
    .trim();
  return { clock, meridiem };
}

// Convert a form field between the two "when" input formats when the all-day
// toggle flips: a `date` value (YYYY-MM-DD) ⇄ a `datetime-local` value
// (YYYY-MM-DDTHH:mm). Empty stays empty.
function reshapeWhen(value: string, toAllDay: boolean): string {
  if (value.length === 0) return "";
  if (toAllDay) return value.slice(0, 10);
  return value.length === 10 ? `${value}T09:00` : value;
}

// A local `datetime-local` / `date` string → an absolute ISO instant. A timed
// value is interpreted in the viewer's own timezone (that is what the browser
// does with a tz-less datetime); an all-day value is date-only and pinned to UTC
// midnight so it reads as the same calendar day everywhere.
function toInstant(local: string, allDay: boolean): string {
  const date = allDay ? new Date(`${local}T00:00:00.000Z`) : new Date(local);
  return date.toISOString();
}

// The inverse of `toInstant`, for prefilling the edit form: an absolute ISO
// instant → the matching local input string. A timed value renders in the
// viewer's own timezone (mirroring how the browser reads a tz-less
// `datetime-local`); an all-day value is the UTC date portion, so it stays the
// same calendar day everywhere. `null`/empty stays empty.
function toLocalInput(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (allDay) return date.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/* -------------------------------------------------------------------------- */
/*                    Live weather (Smart Planning egress)                    */
/* -------------------------------------------------------------------------- */

// The weather route's shape. Weather is a live read the client caches briefly —
// it is never persisted server-side; only the geocoded coordinates are.

/**
 * The Outfit Calendar's always-works base: a Monday-start **agenda week** of the
 * signed-in user's manually-added events, with forward/back navigation. Opening
 * it is a pure read — it fetches events and renders; there is no AI and no
 * external request. Events can be added and hard-deleted; past days are
 * read-only (you cannot add to them).
 *
 * The viewer's timezone and "today" are resolved after mount, because the whole
 * week structure depends on them and computing them during SSR would mismatch on
 * hydration. Until they resolve, a stable skeleton renders.
 */
export function CalendarSurface() {
  // The viewer's zone and today's civil date, resolved once after mount. Held
  // together (null until resolved) so a single post-mount state write flips the
  // skeleton to the real agenda without an intermediate render.
  const [clock, setClock] = React.useState<{ tz: string; today: CivilDate } | null>(
    null,
  );
  const tz = clock?.tz ?? "UTC";
  const today = clock?.today ?? null;
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [events, setEvents] = React.useState<PlannedEventDto[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const [addFor, setAddFor] = React.useState<CivilDate | null>(null);
  const [adding, setAdding] = React.useState(false);
  // The event currently open in the edit dialog, or `null` when not editing.
  const [editEvent, setEditEvent] = React.useState<PlannedEventDto | null>(null);

  // Smart Planning consent gates all outside contact (geocoding + weather).
  // `null` while we resolve it; `true`/`false` once known. Weather only ever
  // fires when it is active — opting in permits egress, viewing a placed event
  // is what triggers it.
  const [consentActive, setConsentActive] = React.useState<boolean | null>(null);
  const [showDisclosure, setShowDisclosure] = React.useState(false);
  // Sequential "Plan my week" progress (null when not running), and a pending
  // flag so a week plan blocked on consent resumes once Smart Planning is on.
  // Per-event planning now lives on the detail page, so the week batch is the
  // only planning this surface still drives.
  const [weekPlan, setWeekPlan] = React.useState<{ done: number; total: number } | null>(
    null,
  );
  const pendingWeekRef = React.useRef(false);
  const queryClient = useQueryClient();

  // Resolve the viewer's zone and today's civil date once, after mount. Done
  // client-side (not during SSR) because the whole week structure depends on the
  // viewer's timezone and computing it on the server would mismatch on hydration.
  React.useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time resolve of the client-only viewer clock on mount
    setClock({ tz: zone, today: civilDateInTimeZone(new Date(), zone) });
  }, []);

  const monday = today ? weekStartFor(today, weekOffset) : null;

  React.useEffect(() => {
    if (!monday) return;
    const controller = new AbortController();
    const { from, to } = weekInstantRange(monday);

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/aura/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { signal: controller.signal },
        );
        const body = (await response.json().catch(() => null)) as EventsResponse | null;
        if (!response.ok || !body?.events) {
          throw new Error(body?.error ?? "We couldn't load your calendar.");
        }
        if (!controller.signal.aborted) setEvents(body.events);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setEvents([]);
        setError(
          reason instanceof Error ? reason.message : "We couldn't load your calendar.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [monday, refresh]);

  // Resolve current Smart Planning consent once after mount. This is an internal
  // read (our own DB) — no third-party contact — so it doesn't break the calendar
  // being egress-free until consent is active and a placed event is viewed.
  React.useEffect(() => {
    const controller = new AbortController();
    async function loadConsent() {
      try {
        const response = await fetch("/api/aura/calendar/consent", {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | { active?: boolean }
          | null;
        if (!controller.signal.aborted) {
          setConsentActive(Boolean(response.ok && body?.active));
        }
      } catch {
        if (!controller.signal.aborted) setConsentActive(false);
      }
    }
    void loadConsent();
    return () => controller.abort();
  }, []);

  /** Record consent for the disclosed policy version, then let weather fire. */
  async function enableSmartPlanning() {
    try {
      const response = await fetch("/api/aura/calendar/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION }),
      });
      const body = (await response.json().catch(() => null)) as
        | { active?: boolean; error?: string }
        | null;
      if (!response.ok || !body?.active) {
        toast.error("We couldn't turn on Smart Planning", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }
      setShowDisclosure(false);
      setConsentActive(true);
      // Resume the "Plan my week" batch if that's what raised the disclosure.
      const pendingWeek = pendingWeekRef.current;
      pendingWeekRef.current = false;
      if (pendingWeek) void planWeek();
    } catch {
      toast.error("We couldn't turn on Smart Planning", {
        description: "Please try again.",
      });
    }
  }

  /** Inject a freshly planned outfit into local state so it renders inline (and
   *  again on reload — it is persisted). */
  function injectOutfit(eventId: string, outfit: PlannedOutfitDto) {
    setEvents((current) =>
      current.map((candidate) =>
        candidate.id === eventId ? { ...candidate, outfit } : candidate,
      ),
    );
  }

  /** "Plan my week": fill only the unplanned, non-past events of the viewed week,
   *  sequentially by date, non-destructively. Each call is fed the ids committed
   *  to earlier events this week (so distinctive pieces don't repeat), one failing
   *  day never sinks the rest, and each outfit reveals as it resolves. Consent is
   *  checked up front — if it isn't active, the disclosure is raised and the week
   *  plan resumes on agreement. */
  async function planWeek() {
    if (consentActive !== true) {
      pendingWeekRef.current = true;
      setShowDisclosure(true);
      return;
    }
    if (weekPlanTargets.length === 0) return;

    setWeekPlan({ done: 0, total: weekPlanTargets.length });
    try {
      const outcomes = await planWeekSequentially(
        weekPlanTargets,
        async (event, priorItemIds) => {
          const result = await requestPlan(event.id, priorItemIds);
          // A consent-required or errored day resolves to null — continue-on-error
          // records it as a failure and the week carries on.
          return "outfit" in result ? result.outfit : null;
        },
        (outcome) => {
          if (outcome.outfit) injectOutfit(outcome.event.id, outcome.outfit);
          setWeekPlan((current) =>
            current ? { ...current, done: current.done + 1 } : current,
          );
        },
      );

      const planned = outcomes.filter((outcome) => outcome.outfit).length;
      const failed = outcomes.length - planned;
      if (planned === 0) {
        toast.error("We couldn't plan your week", { description: "Please try again." });
      } else if (failed === 0) {
        toast.success("Your week is planned", {
          description: `${planned} ${planned === 1 ? "outfit" : "outfits"} from your wardrobe.`,
        });
      } else {
        toast.success(`Planned ${planned} of ${outcomes.length}`, {
          description: `${failed} couldn't be planned — try those again individually.`,
        });
      }
    } finally {
      setWeekPlan(null);
    }
  }

  /** Withdraw consent: future geocoding/weather is barred and any shown weather
   *  is dropped. Events and outfits are untouched (withdrawal is forward-only). */
  async function disableSmartPlanning() {
    try {
      const response = await fetch("/api/aura/calendar/consent", { method: "DELETE" });
      if (!response.ok) throw new Error("withdraw failed");
      setConsentActive(false);
      queryClient.removeQueries({ queryKey: ["calendar-weather"] });
      toast.success("Smart Planning turned off", {
        description: "Weather won't be fetched. Your events are untouched.",
      });
    } catch {
      toast.error("We couldn't update that choice", { description: "Please try again." });
    }
  }

  async function deleteEvent(event: PlannedEventDto) {
    // Optimistic: drop it locally, restore on failure.
    setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    try {
      const response = await fetch(`/api/aura/calendar/events/${event.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error();
      toast.success("Event deleted");
    } catch {
      setEvents((current) => [...current, event]);
      toast.error("We couldn't delete that event", {
        description: "Please try again.",
      });
    }
  }

  function openAdd(date: CivilDate) {
    setAddFor(date);
    setAdding(true);
  }

  const days = monday ? weekDates(monday) : [];
  const eventsByDay = new Map<CivilDate, PlannedEventDto[]>();
  for (const day of days) eventsByDay.set(day, []);
  if (today) {
    for (const event of events) {
      const civil = eventCivilDate(event, tz);
      eventsByDay.get(civil)?.push(event);
    }
  }
  for (const list of eventsByDay.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }

  const weekLabel = monday
    ? `${rangeStartFmt.format(civilToUtcNoon(monday))} – ${rangeEndFmt.format(
        civilToUtcNoon(days[6]),
      )}`
    : "";

  // "Plan my week" targets: the unplanned events on non-past days of the viewed
  // week, in date order. Past days are the read-only archive; already-planned
  // events are skipped (the batch is non-destructive). The orchestrator re-sorts
  // and re-filters, so this only has to scope the set the button acts on.
  const weekPlanTargets = today
    ? days
        .filter((day) => !isPastDate(day, today))
        .flatMap((day) => eventsByDay.get(day) ?? [])
        .filter((event) => event.outfit === null)
    : [];

  // Weather is an outside contact — fetch only once consent is active. Placed
  // events in the viewed week are what the disclosure/attribution key off.
  const weatherEnabled = consentActive === true;
  const hasPlacedInView = days.some((day) =>
    (eventsByDay.get(day) ?? []).some((event) => Boolean(event.placeText)),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-brand-magenta text-xs font-bold tracking-[0.18em] uppercase">
            Outfit Calendar
          </p>
          <h1 className="font-heading mt-2 text-4xl tracking-wide uppercase sm:text-5xl">
            Your week
          </h1>
          <p className="text-muted-foreground mt-2 max-w-md text-sm text-pretty">
            Add what&apos;s coming up, one occasion at a time, then let AURA plan
            each outfit from your own wardrobe.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            className="rounded-full"
            render={<Link href="/aura/calendar/settings" aria-label="Calendar settings" />}
          >
            <Settings2 />
            <span className="sr-only sm:not-sr-only">Settings</span>
          </Button>
          {/* Secondary to "Plan my week": the CTA fill is the app's single action
              colour (`--cta`, declared once and never themed), so only the
              week's primary action may wear it. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => openAdd(today ?? "")}
            disabled={!today}
            className="rounded-full"
          >
            <CalendarPlus />
            Add event
          </Button>
        </div>
      </div>

      {/* Week navigation toolbar. */}
      <div className="border-border mt-8 flex items-center justify-between gap-3 border-y py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setWeekOffset((offset) => offset - 1)}
          disabled={!today}
        >
          <ChevronLeft />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Button>
        <div className="text-center">
          <p className="font-heading text-lg tracking-wide uppercase">{weekLabel || "…"}</p>
          {weekOffset !== 0 && today ? (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-brand-magenta text-xs font-semibold tracking-wide uppercase underline underline-offset-4"
            >
              Back to this week
            </button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setWeekOffset((offset) => offset + 1)}
          disabled={!today}
        >
          <span className="sr-only sm:not-sr-only">Next</span>
          <ChevronRight />
        </Button>
      </div>

      {/* Read-only Google Calendar import — a secondary, dismissible nudge whose
          OAuth grant is its own consent (independent of Smart Planning). A synced
          import re-fetches so freshly-imported events land in the right day. */}
      <GoogleCalendarConnect
        startOfTodayIso={today ? `${today}T00:00:00.000Z` : null}
        onSynced={() => setRefresh((value) => value + 1)}
      />

      {/* Smart Planning invite — shown inline before the first outside contact,
          only when there is a placed event whose weather we could fetch. */}
      {hasPlacedInView && consentActive === false ? (
        <SmartPlanningBanner onTurnOn={() => setShowDisclosure(true)} />
      ) : null}

      {/* The week-level invitation, sitting directly above the agenda it fills.
          Deliberately borderless: two bordered strips already precede the
          calendar, and a third box would push the week itself below the fold.
          It renders only while the viewed week still has unplanned events, so
          it retires as you work through them rather than nagging every visit. */}
      {today && weekPlanTargets.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className="flex items-start gap-2 text-sm text-pretty">
            <Sparkles
              className="text-brand-magenta mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              {weekPlan ? (
                "Each outfit appears as AURA finishes it."
              ) : (
                <>
                  Wish someone would plan your outfits?{" "}
                  <span className="text-muted-foreground">
                    {weekPlanTargets.length}{" "}
                    {weekPlanTargets.length === 1 ? "event" : "events"}, from your
                    own wardrobe.
                  </span>
                </>
              )}
            </span>
          </p>
          <Button
            type="button"
            variant="cta-flat"
            onClick={() => void planWeek()}
            disabled={weekPlan !== null}
            className="rounded-full"
          >
            {weekPlan ? (
              <>
                <Loader2 className="animate-spin" />
                Planning your week… ({weekPlan.done}/{weekPlan.total})
              </>
            ) : (
              "Plan my week"
            )}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="border-destructive/40 bg-destructive/5 mt-8 rounded-2xl border p-6 text-center">
          <p className="font-semibold">We couldn&apos;t load your calendar</p>
          <p className="text-muted-foreground mt-2 text-sm">{error}</p>
        </div>
      ) : (
        <div className="mt-2 divide-y" aria-live="polite" aria-busy={loading}>
          {!today ? (
            <AgendaSkeleton />
          ) : (
            days.map((day) => (
              <DaySection
                key={day}
                date={day}
                today={today}
                events={eventsByDay.get(day) ?? []}
                loading={loading}
                weatherEnabled={weatherEnabled}
                onAdd={() => openAdd(day)}
                onEdit={setEditEvent}
                onDelete={deleteEvent}
              />
            ))
          )}
        </div>
      )}

      {/* Open-Meteo attribution (required) + forward-only withdrawal, shown once
          weather is actually being displayed. */}
      {hasPlacedInView && weatherEnabled ? (
        <div className="text-muted-foreground mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-4 text-xs">
          <p>
            Weather &amp; location data by{" "}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-foreground underline underline-offset-2"
            >
              Open-Meteo.com
            </a>
          </p>
          <button
            type="button"
            onClick={() => void disableSmartPlanning()}
            className="hover:text-foreground underline underline-offset-2"
          >
            Turn off Smart Planning
          </button>
        </div>
      ) : null}

      {adding || editEvent ? (
        <AddEventDialog
          defaultDate={addFor}
          event={editEvent}
          existingEvents={events}
          onClose={() => {
            setAdding(false);
            setEditEvent(null);
          }}
          onSaved={(event, mode) => {
            setAdding(false);
            setEditEvent(null);
            // Refetch so a moved event lands in the right day even if its new
            // time falls in a different week than the one on screen.
            setRefresh((value) => value + 1);
            if (mode === "updated") {
              toast.success("Event updated", { description: event.title });
            } else {
              toast.success("Event added", { description: event.title });
            }
          }}
        />
      ) : null}

      {showDisclosure ? (
        <SmartPlanningDisclosure
          onAgree={() => void enableSmartPlanning()}
          onCancel={() => {
            pendingWeekRef.current = false;
            setShowDisclosure(false);
          }}
        />
      ) : null}
    </main>
  );
}

function DaySection({
  date,
  today,
  events,
  loading,
  weatherEnabled,
  onAdd,
  onEdit,
  onDelete,
}: {
  date: CivilDate;
  today: CivilDate;
  events: PlannedEventDto[];
  loading: boolean;
  weatherEnabled: boolean;
  onAdd: () => void;
  onEdit: (event: PlannedEventDto) => void;
  onDelete: (event: PlannedEventDto) => void;
}) {
  const past = isPastDate(date, today);
  const isToday = date === today;
  const anchor = civilToUtcNoon(date);
  // The day header's high/low comes from the day's first placed event (past days
  // are the read-only archive — no live weather there).
  const primaryPlaced = past ? undefined : events.find((event) => event.placeText);

  return (
    <section className={cn("py-4", past && "opacity-60")}>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="font-heading flex items-baseline gap-2 text-lg tracking-wide uppercase">
          <span className={cn(isToday && "text-brand-magenta")}>
            {weekdayFmt.format(anchor)}
          </span>
          <span className="text-muted-foreground text-2xl">{dayNumFmt.format(anchor)}</span>
        </h2>
        {isToday ? (
          <span className="bg-brand-magenta text-brand-magenta-foreground rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase">
            Today
          </span>
        ) : null}
        {weatherEnabled && primaryPlaced ? (
          <span className="ml-auto self-center">
            <DayHighLow eventId={primaryPlaced.id} enabled={weatherEnabled} />
          </span>
        ) : null}
      </div>

      {events.length > 0 ? (
        <ul>
          {events.map((event, index) => {
            const rail = railTime(event);
            const lastEvent = index === events.length - 1;
            // `minmax(0,1fr)`, not `1fr`: a grid column's default min-width is
            // auto, so one long place or title would push its own card wider
            // than the rest of the day.
            return (
            <li key={event.id} className="mb-2 grid grid-cols-[4.25rem_minmax(0,1fr)] gap-3">
              {/* The day's spine: start times on the rail, cards hanging off it.
                  The connector bridges the gap to the next card, so the last
                  event's line stops at its own dot. */}
              <div className="relative pt-4 text-right">
                <span className="border-background bg-cta absolute top-[1.4rem] -right-[0.8rem] size-3 rounded-full border-2" />
                {!lastEvent ? (
                  <span className="bg-border absolute top-[2.2rem] -right-[0.45rem] -bottom-2 w-px" />
                ) : null}
                <span className="font-heading block text-lg tracking-wide tabular-nums">
                  {rail.clock}
                </span>
                <span className="text-muted-foreground text-[0.64rem] tracking-[0.18em] uppercase">
                  {rail.meridiem}
                </span>
              </div>
              <EventCard
                event={event}
                weatherEnabled={weatherEnabled && !past}
                canEdit={!past}
                canPlan={!past}
                onEdit={() => onEdit(event)}
                onDelete={() => onDelete(event)}
              />
            </li>
            );
          })}
          {!past ? <AddToDay onAdd={onAdd} inline /> : null}
        </ul>
      ) : past ? (
        <p className="text-muted-foreground border-border rounded-lg border border-dashed px-3 py-2 text-xs">
          Nothing planned
        </p>
      ) : loading ? (
        <div className="bg-muted h-9 animate-pulse rounded-lg" />
      ) : (
        <AddToDay onAdd={onAdd} />
      )}
    </section>
  );
}

function AddToDay({ onAdd, inline = false }: { onAdd: () => void; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={cn(
        "text-muted-foreground hover:border-brand-magenta hover:text-brand-magenta focus-visible:ring-ring flex w-full items-center gap-2 rounded-lg border border-dashed px-3 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none",
        inline ? "mt-2 py-1.5" : "py-2",
      )}
    >
      <Plus className="size-3.5" />
      {inline ? "Add another event" : "Nothing planned — add an event"}
    </button>
  );
}

/** The AURA seal: the mark a planned event carries where its plan button was.
 *  Drawn at 80% of its box so the neon falloff finishes inside its own bounds
 *  rather than being clipped square by the SVG viewport. The ring text is
 *  decorative at this size — the caption underneath is what actually reads,
 *  and the accessible name lives on the wrapper. */
function AuraSeal({ idSuffix }: { idSuffix: string }) {
  const topId = `aura-seal-top-${idSuffix}`;
  const botId = `aura-seal-bot-${idSuffix}`;
  const ring = (
    <>
      <circle cx="50" cy="50" r="47.5" strokeWidth="2.2" />
      <circle cx="50" cy="50" r="43.5" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="32.5" strokeWidth="1.4" />
      <circle cx="12" cy="50" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="88" cy="50" r="1.9" fill="currentColor" stroke="none" />
      <text className="fill-current text-[6.8px] font-medium tracking-[2.2px] uppercase">
        <textPath href={`#${topId}`} startOffset="50%" textAnchor="middle">
          Planned by AURA
        </textPath>
      </text>
      <text className="fill-current text-[6.8px] font-medium tracking-[2.2px] uppercase">
        <textPath href={`#${botId}`} startOffset="50%" textAnchor="middle">
          Made with intent
        </textPath>
      </text>
      <text x="50" y="53" textAnchor="middle" className="font-serif fill-current text-[20px] tracking-[1px]">
        AURA
      </text>
      <path d="M29 61.5h7M64 61.5h7" strokeWidth="0.8" />
      <text
        x="50"
        y="63.1"
        textAnchor="middle"
        className="fill-current text-[4.6px] font-medium tracking-[1.4px] uppercase"
      >
        Est. 2026
      </text>
    </>
  );

  return (
    <svg
      viewBox="0 0 100 100"
      className="text-brand-magenta dark:text-cta size-16 overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <path id={topId} d="M 14.5,50 a 35.5,35.5 0 0 1 71,0" />
        <path id={botId} d="M 9.5,50 a 40.5,40.5 0 0 0 81,0" />
      </defs>
      <g
        className="text-cta fill-none stroke-current opacity-70 [filter:drop-shadow(0_0_1.5px_currentColor)_drop-shadow(0_0_5px_currentColor)_drop-shadow(0_0_11px_currentColor)] motion-safe:animate-pulse"
        transform="translate(50,50) scale(.8) translate(-50,-50)"
      >
        {ring}
      </g>
      <g
        className="fill-none stroke-current"
        transform="translate(50,50) scale(.8) translate(-50,-50)"
      >
        {ring}
      </g>
    </svg>
  );
}

/** The planned/unplanned seal in a slim card's footer. A read-only summary — all
 *  outfit interaction now lives on the detail page — so it only signals state:
 *  the AURA seal for an AI plan, a quieter "Your pick" for a hand-built one, and
 *  a navigational hint when nothing is planned yet. */
function OutfitSeal({
  outfit,
  eventId,
  canPlan,
}: {
  outfit: PlannedOutfitDto | null;
  eventId: string;
  canPlan: boolean;
}) {
  if (!outfit) {
    return canPlan ? (
      <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
        <Sparkles className="text-brand-magenta size-3.5" aria-hidden="true" />
        Plan this outfit
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    ) : (
      <span className="text-muted-foreground text-[0.62rem] font-medium tracking-[0.16em] uppercase">
        Not planned
      </span>
    );
  }

  // Provenance reads off the pick's origin: an AI plan wears the AURA seal; a
  // hand-built look (`user_edited`, no AI rationale) gets a quieter mark, so the
  // seal never claims AURA planned something the participant chose themselves.
  if (outfit.provenance === "user_edited") {
    return (
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Pencil className="size-3.5" aria-hidden="true" />
        Your pick
      </span>
    );
  }

  return (
    <span
      className="flex flex-none flex-col items-center gap-1"
      role="img"
      aria-label="Planned by AURA"
    >
      <span className="rotate-[-9deg] leading-none">
        <AuraSeal idSuffix={eventId} />
      </span>
      <span className="text-foreground font-mono text-[0.56rem] font-semibold tracking-[0.16em] uppercase">
        Planned by AURA
      </span>
    </span>
  );
}

/** A slim event summary that links to the outfit detail page. Every card — planned
 *  or not — is a whole-card link to `/aura/calendar/events/[eventId]`, where all
 *  planning, preview, swap and manual-pick now live. The card itself carries no
 *  outfit interaction: it shows the event's facts (title, occasion, time, place,
 *  weather) and a read-only planned/unplanned seal. Edit and delete stay as
 *  affordances, layered above the link so they stay independently clickable. */
function EventCard({
  event,
  weatherEnabled,
  canEdit,
  canPlan,
  onEdit,
  onDelete,
}: {
  event: PlannedEventDto;
  weatherEnabled: boolean;
  canEdit: boolean;
  canPlan: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="border-border bg-card group focus-within:border-brand-magenta/50 hover:border-brand-magenta/50 relative rounded-xl border shadow-sm transition">
      {/* The whole card navigates. A positioned overlay link covers it, so the
          summary reads as one target; the edit/delete controls sit above it (z-10)
          and stay independently clickable. */}
      <Link
        href={`/aura/calendar/events/${event.id}`}
        aria-label={`Open outfit for ${event.title}`}
        className="focus-visible:ring-brand-magenta/50 absolute inset-0 z-0 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
      />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="font-heading truncate text-base tracking-wide uppercase">
              {event.title}
            </h3>
            {event.source === "google" ? (
              <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                Google
              </span>
            ) : null}
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-0.5">
            {/* A passed event is history — its plan can't change, so it loses its
                pencil. Delete stays: pruning the archive is still allowed. */}
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                aria-label={`Edit ${event.title}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              aria-label={`Delete ${event.title}`}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <TicketField label="Time">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="tabular-nums">{formatEventTime(event)}</span>
          </TicketField>
          {event.placeText ? (
            <TicketField label="Place">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {/* The place, not the postal address — the full text stays on the
                  title, and geocoding still runs against it. */}
              <span className="truncate" title={event.placeText}>
                {shortPlaceLabel(event.placeText)}
              </span>
            </TicketField>
          ) : null}
          {event.placeText ? (
            <EventWeather eventId={event.id} enabled={weatherEnabled} />
          ) : null}
        </div>

        {/* A read-only glance at the planned pieces — the same wardrobe tiles the
            detail page shows, without the Swap/Regenerate controls (those live on
            the Rack). Non-interactive, so a click anywhere still opens the detail
            page. Honest amber gap chips ride alongside for anything the wardrobe
            couldn't cover. */}
        {event.outfit && (event.outfit.items.length > 0 || event.outfit.gaps.length > 0) ? (
          <ul className="flex flex-wrap items-start gap-2">
            {event.outfit.items.map((item) => (
              <li key={item.id}>
                <OutfitItemTile item={item} />
              </li>
            ))}
            {event.outfit.gaps.map((gap, index) => (
              <li key={`${gap.slot}-${index}`} className="self-center">
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                  title={gap.note}
                >
                  <TriangleAlert className="size-3" aria-hidden="true" />
                  {gap.slot}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* The tear line. Its notches are punched in the page colour, so the card
          only reads as torn while it sits on the calendar's own background. */}
      <div className="border-border relative border-t border-dashed" aria-hidden="true">
        <span className="bg-background absolute top-0 -left-2 size-4 -translate-y-1/2 rounded-full" />
        <span className="bg-background absolute top-0 -right-2 size-4 -translate-y-1/2 rounded-full" />
      </div>

      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
        {event.occasion ? (
          <span className="bg-brand-lime text-brand-lime-foreground rounded font-mono text-[0.62rem] tracking-[0.16em] uppercase px-2 py-1">
            {event.occasion}
          </span>
        ) : (
          <span />
        )}
        <OutfitSeal outfit={event.outfit} eventId={event.id} canPlan={canPlan} />
      </div>
    </article>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="bg-muted h-5 w-24 animate-pulse rounded" />
          <div className="bg-muted h-9 animate-pulse rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

/**
 * The result of dry-running the planner's place geocoding for the typed place.
 * `checking`/`error`/`idle` are client-only; the other three mirror the probe
 * route's JSON. `consent_required` is what turns the hint into a Smart Planning
 * nudge rather than a place-found/not-found message.
 */
type PlaceProbe =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "resolved"; placeLabel: string; approximate: boolean }
  | { status: "unresolved" }
  | { status: "consent_required" }
  | { status: "error" };

/**
 * Inline feedback under the Place field. It answers one question — "will this
 * place get me weather-based outfit suggestions?" — and, when Smart Planning is
 * off, nudges the owner to turn it on (the only reason the lookup is withheld).
 */
function PlaceProbeHint({ probe }: { probe: PlaceProbe }) {
  const base = "mt-1 flex items-center gap-1.5 text-sm";

  switch (probe.status) {
    case "idle":
      return null;
    case "checking":
      return (
        <p className={`${base} text-muted-foreground`}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Checking this place…
        </p>
      );
    case "resolved":
      // Whether the place matched exactly or coarsened to its area (the expected
      // path for a "venue, area" entry), the weather comes from the same place —
      // so we confirm it the same way, without a "nearest match" caveat.
      return (
        <p className={`${base} text-brand-magenta`}>
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          <span>
            Weather-ready — we&rsquo;ll use <strong>{probe.placeLabel}</strong> to
            suggest an outfit.
          </span>
        </p>
      );
    case "unresolved":
      return (
        <p className={`${base} text-muted-foreground`}>
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          Couldn&rsquo;t find that place. Add a neighbourhood or city so we can
          check the weather.
        </p>
      );
    case "consent_required":
      return (
        <p className={`${base} text-muted-foreground`}>
          <Sparkles className="text-brand-magenta size-3.5 shrink-0" aria-hidden />
          <span>
            <Link
              href="/aura/calendar/settings"
              className="text-brand-magenta font-medium underline underline-offset-2"
            >
              Turn on Smart Planning
            </Link>{" "}
            to check the weather and suggest an outfit for this place.
          </span>
        </p>
      );
    case "error":
      return (
        <p className={`${base} text-muted-foreground`}>
          Couldn&rsquo;t check that place right now.
        </p>
      );
  }
}

/** One autocomplete candidate — mirrors `PlaceSuggestion` from the server-only
 *  geocoding lib, redeclared here so this client file never imports it. */
type PlaceSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

/** The place segment currently being typed — the text after the last comma. */
function lastSegment(value: string): string {
  return value.split(",").pop()?.trim() ?? "";
}

/** Swap the last comma segment for a chosen area, keeping any venue prefix:
 *  ("Amudham Cafe, Brooke", "Brookefield") → "Amudham Cafe, Brookefield". */
function replaceLastSegment(value: string, replacement: string): string {
  const commaIndex = value.lastIndexOf(",");
  if (commaIndex === -1) return replacement;
  return `${value.slice(0, commaIndex)}, ${replacement}`;
}

/**
 * The Place field: a place-name combobox over the same Open-Meteo index the
 * planner uses. As the owner types we suggest resolvable names — so they pick a
 * label that geocodes (and gets weather) instead of a bare venue name that
 * doesn't. Picking a suggestion is resolvable by construction; free-typing is
 * still checked on blur via {@link PlaceProbeHint}. All outside contact is
 * consent-gated server-side; a `consent_required` reply turns the hint into the
 * Smart Planning nudge. An edited event's existing place seeds `lastProbed` so
 * an unchanged place isn't re-checked.
 */
function PlaceField({
  field,
  inputClassName,
  invalid,
  error,
  initialPlace,
}: {
  field: ControllerRenderProps<PlannedEventFormInput, "placeText">;
  inputClassName: string;
  invalid: boolean;
  error?: string;
  initialPlace: string | null;
}) {
  const [probe, setProbe] = React.useState<PlaceProbe>({ status: "idle" });
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);

  const lastProbed = React.useRef<string | null>(initialPlace);
  const searchAbort = React.useRef<AbortController | null>(null);
  const probeAbort = React.useRef<AbortController | null>(null);
  const debounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = React.useId();

  React.useEffect(
    () => () => {
      searchAbort.current?.abort();
      probeAbort.current?.abort();
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  function closeList() {
    setOpen(false);
    setActiveIndex(-1);
  }

  async function runSearch(text: string) {
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    try {
      const response = await fetch(
        `/api/aura/calendar/place/search?q=${encodeURIComponent(text)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const data = (await response.json().catch(() => null)) as
        | { status: "ok"; places: PlaceSuggestion[] }
        | { status: "consent_required" }
        | null;
      if (controller.signal.aborted || !response.ok || !data) return;
      if (data.status === "consent_required") {
        setSuggestions([]);
        closeList();
        // Surface the nudge as soon as we know egress is gated.
        setProbe({ status: "consent_required" });
        return;
      }
      setSuggestions(data.places);
      setActiveIndex(-1);
      setOpen(data.places.length > 0);
    } catch {
      // A failed search just yields no dropdown; the blur probe still speaks.
    }
  }

  function onType(next: string) {
    field.onChange(next);
    if (probe.status !== "idle") setProbe({ status: "idle" });
    if (debounce.current) clearTimeout(debounce.current);
    // Autocomplete only the segment being typed — the part after the last comma.
    // A "Amudham Cafe, Brooke" entry searches "Brooke", so a venue with an area
    // hint still surfaces the resolvable area (Open-Meteo indexes places, not
    // venues); picking it keeps the venue prefix.
    const segment = lastSegment(next);
    if (segment.length < 2) {
      searchAbort.current?.abort();
      setSuggestions([]);
      closeList();
      return;
    }
    debounce.current = setTimeout(() => void runSearch(segment), 250);
  }

  function choose(suggestion: PlaceSuggestion) {
    const next = replaceLastSegment(field.value ?? "", suggestion.label);
    field.onChange(next);
    // Seed with the FULL text so the blur probe doesn't re-check what we resolved.
    lastProbed.current = next;
    setSuggestions([]);
    closeList();
    // A picked suggestion resolves by construction — confirm without a probe.
    setProbe({
      status: "resolved",
      placeLabel: suggestion.label,
      approximate: false,
    });
  }

  async function runProbe(raw: string) {
    const text = raw.trim();
    if (!text) {
      lastProbed.current = "";
      setProbe({ status: "idle" });
      return;
    }
    if (text === lastProbed.current) return;
    lastProbed.current = text;

    probeAbort.current?.abort();
    const controller = new AbortController();
    probeAbort.current = controller;
    setProbe({ status: "checking" });
    try {
      const response = await fetch("/api/aura/calendar/place/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeText: text }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const data = (await response.json().catch(() => null)) as PlaceProbe | null;
      if (controller.signal.aborted) return;
      setProbe(response.ok && data ? data : { status: "error" });
    } catch {
      if (!controller.signal.aborted) setProbe({ status: "error" });
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      // Pick the highlighted suggestion — never submit the form from here.
      event.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      closeList();
    }
  }

  return (
    <div className="relative">
      <Input
        {...field}
        id="event-place"
        className={inputClassName}
        placeholder="e.g. Amudham Cafe, Brookefield"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined
        }
        aria-invalid={invalid}
        onChange={(event) => onType(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          void field.onBlur();
          closeList();
          void runProbe(event.currentTarget.value);
        }}
      />
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-xl border shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.label}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Select on mousedown so the pick lands before the input blurs.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                index === activeIndex && "bg-accent text-accent-foreground",
              )}
            >
              <MapPin
                className="text-muted-foreground size-3.5 shrink-0"
                aria-hidden
              />
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
      <FieldError message={error} />
      {!error && <PlaceProbeHint probe={probe} />}
    </div>
  );
}

/** Inline invitation to turn on Smart Planning, shown before any outside contact
 *  when the viewed week has a placed event whose weather we could fetch. */
function SmartPlanningBanner({ onTurnOn }: { onTurnOn: () => void }) {
  return (
    <div className="border-border bg-muted/40 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="text-brand-magenta mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">See live weather for your events</p>
          <p className="text-muted-foreground mt-0.5 text-sm text-pretty">
            Turn on Smart Planning to fetch each placed event&apos;s forecast. Your
            event titles never leave the app.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="cta-flat"
        onClick={onTurnOn}
        className="rounded-full"
      >
        Turn on
      </Button>
    </div>
  );
}

/** Sentence fragment naming the events a new/edited event overlaps, e.g.
 *  `"Lunch"` or `"Lunch" and "Gym"`. */
function clashSentence(titles: string[]): string {
  const quoted = titles.map((title) => `“${title}”`);
  if (quoted.length <= 1) return quoted[0] ?? "another event";
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}

/** The wire body for a create/edit, before the overlap flag is attached. */
type EventPayload = {
  title: string;
  occasion: string;
  allDay: boolean;
  startsAt: string;
  endsAt: string | undefined;
  placeText: string;
};

function AddEventDialog({
  defaultDate,
  event: editing,
  existingEvents,
  onClose,
  onSaved,
}: {
  defaultDate: CivilDate | null;
  // The event being edited, or `null`/undefined to add a new one.
  event?: PlannedEventDto | null;
  // The loaded week's events, for the instant client-side overlap pre-check. The
  // server re-checks authoritatively (it sees events outside the loaded week).
  existingEvents: PlannedEventDto[];
  onClose: () => void;
  onSaved: (event: PlannedEventDto, mode: "created" | "updated") => void;
}) {
  const isEditing = Boolean(editing);
  // A raised overlap warning: the titles it clashes with, plus the exact payload
  // to re-send with `allowOverlap` if the owner chooses to save anyway. `null`
  // when no warning is showing.
  const [clash, setClash] = React.useState<{
    titles: string[];
    payload: EventPayload;
  } | null>(null);
  const [overlapSaving, setOverlapSaving] = React.useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PlannedEventFormInput>({
    resolver: zodResolver(plannedEventFormSchema),
    defaultValues: editing
      ? {
          title: editing.title,
          // A Google import lands with the default occasion; don't prefill that
          // literal so an untouched edit doesn't look owner-entered.
          occasion:
            editing.occasion && editing.occasion !== DEFAULT_PLANNED_OCCASION
              ? editing.occasion
              : "",
          allDay: editing.allDay,
          startsAtLocal: toLocalInput(editing.startsAt, editing.allDay),
          endsAtLocal: toLocalInput(editing.endsAt, editing.allDay),
          placeText: editing.placeText ?? "",
        }
      : {
          title: "",
          occasion: "",
          allDay: false,
          startsAtLocal: defaultDate ? `${defaultDate}T09:00` : "",
          endsAtLocal: "",
          placeText: "",
        },
  });

  const allDay = useWatch({ control, name: "allDay" });

  React.useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // POST/PATCH the event. `allowOverlap` waives the server's soft time-clash
  // guard — set once the owner has seen the warning and chosen to save anyway.
  async function sendEvent(payload: EventPayload, allowOverlap: boolean) {
    let response: Response;
    try {
      response = await fetch(
        editing
          ? `/api/aura/calendar/events/${editing.id}`
          : "/api/aura/calendar/events",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, allowOverlap }),
        },
      );
    } catch {
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    const body = (await response.json().catch(() => null)) as
      | (EventResponse & { code?: string; clashes?: { id: string; title: string }[] })
      | null;

    // The server is authoritative — it sees events outside the loaded week the
    // client pre-check can't. A clash it catches raises the same confirm prompt
    // rather than a hard error.
    if (response.status === 409 && body?.code === "time-clash") {
      setClash({ titles: (body.clashes ?? []).map((c) => c.title), payload });
      return;
    }

    if (!response.ok || !body?.event) {
      toast.error(isEditing ? "We couldn't save your changes" : "We couldn't add your event", {
        description: body?.error ?? "Please try again.",
      });
      return;
    }

    onSaved(body.event, isEditing ? "updated" : "created");
  }

  async function onSubmit(values: PlannedEventFormInput) {
    const payload: EventPayload = {
      title: values.title,
      occasion: values.occasion,
      allDay: values.allDay,
      startsAt: toInstant(values.startsAtLocal, values.allDay),
      endsAt: values.endsAtLocal
        ? toInstant(values.endsAtLocal, values.allDay)
        : undefined,
      placeText: values.placeText,
    };

    // Instant pre-check against the loaded week: a clash raises the confirm
    // prompt before any request, so an accidental double-book is caught even
    // offline. Editing excludes the event itself.
    const clashes = findClashes(
      { startsAt: payload.startsAt, endsAt: payload.endsAt ?? null, allDay: payload.allDay },
      existingEvents,
      editing?.id,
    );
    if (clashes.length > 0) {
      setClash({ titles: clashes.map((c) => c.title), payload });
      return;
    }

    await sendEvent(payload, false);
  }

  /** Save despite the overlap warning: re-send the held payload with the guard
   *  waived. */
  async function confirmOverlap() {
    if (!clash) return;
    const { payload } = clash;
    setClash(null);
    setOverlapSaving(true);
    try {
      await sendEvent(payload, true);
    } finally {
      setOverlapSaving(false);
    }
  }

  const fieldClass =
    "focus-visible:border-brand-magenta focus-visible:ring-brand-magenta/30 h-11 rounded-xl px-4";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit event" : "Add an event"}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-brand-ink/60 p-4 backdrop-blur-sm"
      onMouseDown={(mouseEvent) => {
        // A click on the backdrop dismisses the form — but only while it's
        // untouched. Once there's unsaved input, a stray outside-click (easy to
        // trigger while reaching for the native date picker) must not discard
        // the whole form: close it deliberately with Cancel or Add event.
        if (mouseEvent.target === mouseEvent.currentTarget && !isDirty) onClose();
      }}
    >
      <section className="bg-card text-card-foreground relative my-auto w-full max-w-lg rounded-3xl border p-6 shadow-2xl sm:p-8">
        {/* Soft overlap warning, in place of a hard block: a time clash is often
            deliberate, so this catches the accidental double-book and lets the
            owner proceed on purpose. */}
        {clash ? (
          <div className="bg-card/95 absolute inset-0 z-10 grid place-items-center rounded-3xl p-6 backdrop-blur-sm">
            <div role="alertdialog" aria-label="Time clash" className="w-full max-w-sm text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-6" aria-hidden="true" />
              </div>
              <h3 className="font-heading mt-3 text-xl tracking-wide uppercase">
                Times overlap
              </h3>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">
                This {isEditing ? "new time" : "event"} overlaps {clashSentence(clash.titles)}.
                Add it anyway?
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  type="button"
                  onClick={() => void confirmOverlap()}
                  disabled={overlapSaving}
                  className="bg-brand-magenta text-brand-magenta-foreground rounded-full px-6 hover:brightness-105"
                >
                  {overlapSaving
                    ? "Saving…"
                    : isEditing
                      ? "Save anyway"
                      : "Add anyway"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setClash(null)}
                  disabled={overlapSaving}
                  className="rounded-full px-6"
                >
                  Go back
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        <h2 className="font-heading text-brand-magenta text-2xl tracking-wide uppercase sm:text-3xl">
          {isEditing ? "Edit event" : "Add an event"}
        </h2>
        <form className="mt-6 grid gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              className={fieldClass}
              placeholder="Dinner with Sam"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            <FieldError message={errors.title?.message} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-occasion">
              Occasion{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="event-occasion"
              className={fieldClass}
              placeholder="e.g. dinner date, office, wedding"
              aria-invalid={!!errors.occasion}
              {...register("occasion")}
            />
            <FieldError message={errors.occasion?.message} />
          </div>

          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="allDay"
              render={({ field }) => (
                <Checkbox
                  id="event-all-day"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    const next = checked === true;
                    field.onChange(next);
                    setValue(
                      "startsAtLocal",
                      reshapeWhen(getValues("startsAtLocal"), next),
                    );
                    setValue(
                      "endsAtLocal",
                      reshapeWhen(getValues("endsAtLocal"), next),
                    );
                  }}
                />
              )}
            />
            <Label htmlFor="event-all-day" className="font-normal">
              All day
            </Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="event-start">Starts</Label>
              <Input
                id="event-start"
                type={allDay ? "date" : "datetime-local"}
                className={fieldClass}
                aria-invalid={!!errors.startsAtLocal}
                {...register("startsAtLocal")}
              />
              <FieldError message={errors.startsAtLocal?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-end">
                Ends{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="event-end"
                type={allDay ? "date" : "datetime-local"}
                className={fieldClass}
                aria-invalid={!!errors.endsAtLocal}
                {...register("endsAtLocal")}
              />
              <FieldError message={errors.endsAtLocal?.message} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-place">
              Place{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="placeText"
              render={({ field }) => (
                <PlaceField
                  field={field}
                  inputClassName={fieldClass}
                  invalid={!!errors.placeText}
                  error={errors.placeText?.message}
                  initialPlace={editing?.placeText ?? null}
                />
              )}
            />
          </div>

          <div className="mt-1 flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting || overlapSaving}
              className="bg-brand-magenta text-brand-magenta-foreground rounded-full px-6 hover:brightness-105"
            >
              {isEditing
                ? isSubmitting
                  ? "Saving…"
                  : "Save changes"
                : isSubmitting
                  ? "Adding…"
                  : "Add event"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-full px-6"
            >
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
