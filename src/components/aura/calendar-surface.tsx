"use client";

import * as React from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Replace,
  Shirt,
  Sun,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  plannedEventFormSchema,
  type PlannedEventFormInput,
} from "@/lib/validations";
import type { PlannedOutfitDto } from "@/lib/aura-outfit-planner";
import {
  PLANNING_POLICY_VERSION,
  SMART_PLANNING_DISCLOSURE,
} from "@/lib/planning-policy";
import type { WeatherGroup } from "@/lib/weather-code";
import type { WeatherStatus } from "@/lib/weather";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StylePreferenceCard } from "@/components/aura/style-preference-card";

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
type PlanResponse = { outfit?: PlannedOutfitDto; error?: string; code?: string };

/** An inline nudge to an already-planned outfit (#178): Regenerate the whole pick
 *  or Swap one wardrobe piece. Mirrors the route's discriminated body. */
type OutfitEdit = { mode: "regenerate" } | { mode: "swap"; itemId: string };

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
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function formatEventTime(event: PlannedEventDto): string {
  if (event.allDay) return "All day";
  const start = timeFmt.format(new Date(event.startsAt));
  if (event.endsAt) {
    return `${start} – ${timeFmt.format(new Date(event.endsAt))}`;
  }
  return start;
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

/* -------------------------------------------------------------------------- */
/*                    Live weather (Smart Planning egress)                    */
/* -------------------------------------------------------------------------- */

// The weather route's shape. Weather is a live read the client caches briefly —
// it is never persisted server-side; only the geocoded coordinates are.
type EventWeatherResponse = {
  placed: boolean;
  unresolved?: boolean;
  approximate?: boolean;
  place?: {
    latitude: number;
    longitude: number;
    timezone: string;
    placeLabel: string | null;
  } | null;
  weather?: {
    date: string;
    weatherCode: number;
    description: { label: string; group: WeatherGroup };
    temperatureMax: number;
    temperatureMin: number;
    precipitationProbabilityMax: number | null;
  } | null;
  weatherStatus?: WeatherStatus;
};

const WEATHER_ICON: Record<WeatherGroup, typeof Cloud> = {
  clear: Sun,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  showers: CloudRain,
  snow: CloudSnow,
  thunderstorm: CloudLightning,
  unknown: Cloud,
};

// ~2h stale window: weather isn't stored, so this is the "cached briefly per
// (place, day)" TTL the spec calls for. Keyed per event (place + day are fixed
// per event), so both the day header and the event card share one fetch.
const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;

function fmtTemp(value: number): string {
  return `${Math.round(value)}°`;
}

async function fetchEventWeather(eventId: string): Promise<EventWeatherResponse> {
  const response = await fetch(`/api/aura/calendar/events/${eventId}/weather`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Echo the disclosed policy version — the egress boundary refuses a stale one.
    body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION }),
  });
  if (!response.ok) {
    throw new Error(`weather request failed (${response.status})`);
  }
  return (await response.json()) as EventWeatherResponse;
}

/** Live weather for one placed event, gated on active Smart Planning consent.
 *  Keyed by event id so the day header and the event card dedupe to one fetch. */
function useEventWeather(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["calendar-weather", eventId, PLANNING_POLICY_VERSION],
    queryFn: () => fetchEventWeather(eventId),
    enabled,
    staleTime: WEATHER_STALE_MS,
    gcTime: WEATHER_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

/** Compact per-event weather line: icon · conditions · high/low, with honest
 *  fallbacks for an unlocatable place or a date past the forecast horizon. */
function EventWeather({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const { data, isLoading, isError } = useEventWeather(eventId, enabled);

  if (!enabled) return null;
  if (isLoading) {
    return <div className="bg-muted mt-2 h-4 w-32 animate-pulse rounded" aria-hidden="true" />;
  }
  if (isError || !data || data.placed === false) return null;

  if (data.unresolved) {
    return (
      <p className="text-muted-foreground mt-1.5 text-xs">
        Couldn&apos;t locate that place — no weather.
      </p>
    );
  }

  const weather = data.weather;
  if (!weather) {
    const note =
      data.weatherStatus === "beyond-horizon"
        ? "Forecast not available yet."
        : "Weather unavailable right now.";
    return <p className="text-muted-foreground mt-1.5 text-xs">{note}</p>;
  }

  const Icon = WEATHER_ICON[weather.description.group] ?? Cloud;
  const precip = weather.precipitationProbabilityMax;
  // Always name the place the forecast is actually for — a coarsened match reads
  // as "nearest match" so the calendar never silently attaches a broader place's
  // weather to a venue it couldn't pinpoint.
  const placeLabel = data.place?.placeLabel;

  return (
    <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span className="text-foreground inline-flex items-center gap-1.5 font-medium">
        <Icon className="size-3.5" aria-hidden="true" />
        {weather.description.label}
      </span>
      <span>
        {fmtTemp(weather.temperatureMax)} / {fmtTemp(weather.temperatureMin)}
      </span>
      {typeof precip === "number" && precip >= 40 ? (
        <span>{precip}% rain</span>
      ) : null}
      {placeLabel ? (
        <span className="italic">
          {data.approximate ? `nearest match: ${placeLabel}` : placeLabel}
        </span>
      ) : null}
    </div>
  );
}

/** The day high/low shown in a day header, sourced from that day's first placed
 *  event. Shares the event's weather query, so it adds no extra fetch. */
function DayHighLow({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const { data } = useEventWeather(eventId, enabled);
  const weather = enabled && data?.weather ? data.weather : null;
  if (!weather) return null;
  const Icon = WEATHER_ICON[weather.description.group] ?? Cloud;
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-1.5 text-sm font-medium"
      title={weather.description.label}
    >
      <Icon className="size-4" aria-hidden="true" />
      {fmtTemp(weather.temperatureMax)} / {fmtTemp(weather.temperatureMin)}
    </span>
  );
}

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

  // Smart Planning consent gates all outside contact (geocoding + weather).
  // `null` while we resolve it; `true`/`false` once known. Weather only ever
  // fires when it is active — opting in permits egress, viewing a placed event
  // is what triggers it.
  const [consentActive, setConsentActive] = React.useState<boolean | null>(null);
  const [showDisclosure, setShowDisclosure] = React.useState(false);
  // The event currently being planned (drives its inline spinner), and — when a
  // plan is blocked on consent — the event to resume once Smart Planning is on.
  const [planningId, setPlanningId] = React.useState<string | null>(null);
  const pendingPlanRef = React.useRef<PlannedEventDto | null>(null);
  // The outfit currently being edited inline (Regenerate/Swap) and, for a Swap,
  // the specific piece — so only the touched tile and the touched outfit show a
  // spinner. Held apart from `planningId` (the initial plan) so both can coexist.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [swapItemId, setSwapItemId] = React.useState<string | null>(null);
  const pendingReplanRef = React.useRef<{ event: PlannedEventDto; edit: OutfitEdit } | null>(
    null,
  );
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
      // Resume whatever was blocked on consent — the initial plan, or an inline
      // Regenerate/Swap — depending on which raised the disclosure.
      const pending = pendingPlanRef.current;
      pendingPlanRef.current = null;
      const pendingReplan = pendingReplanRef.current;
      pendingReplanRef.current = null;
      if (pending) void planOutfit(pending);
      else if (pendingReplan) void replanOutfit(pendingReplan.event, pendingReplan.edit);
    } catch {
      toast.error("We couldn't turn on Smart Planning", {
        description: "Please try again.",
      });
    }
  }

  /** Plan one event's outfit with a single AI call, gated by Smart Planning
   *  consent. If consent isn't active yet, the route replies 403 and we raise the
   *  disclosure, resuming this plan on agreement. On success the outfit is injected
   *  into local state so it renders inline (and again on reload — it is persisted). */
  async function planOutfit(event: PlannedEventDto) {
    setPlanningId(event.id);
    try {
      const response = await fetch(`/api/aura/calendar/events/${event.id}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION }),
      });
      const body = (await response.json().catch(() => null)) as PlanResponse | null;

      if (response.status === 403 && body?.code === "consent-required") {
        pendingPlanRef.current = event;
        setShowDisclosure(true);
        return;
      }
      if (!response.ok || !body?.outfit) {
        toast.error("We couldn't plan this outfit", {
          description: body?.error ?? "Please try again.",
        });
        return;
      }

      const outfit = body.outfit;
      setEvents((current) =>
        current.map((candidate) =>
          candidate.id === event.id ? { ...candidate, outfit } : candidate,
        ),
      );
      toast.success("Outfit planned", {
        description:
          outfit.items.length > 0
            ? `${outfit.items.length} ${outfit.items.length === 1 ? "piece" : "pieces"} from your wardrobe`
            : "AURA flagged a wardrobe gap.",
      });
    } catch {
      toast.error("We couldn't plan this outfit", { description: "Please try again." });
    } finally {
      setPlanningId((current) => (current === event.id ? null : current));
    }
  }

  /** Nudge an already-planned outfit inline (#178): Regenerate the whole pick or
   *  Swap one piece. Exclusion is applied server-side in the prompt (soft), so the
   *  result is a fresh outfit that flips provenance to `user_edited`. Like the
   *  initial plan, a withdrawn consent replies 403 and we raise the disclosure,
   *  resuming this exact edit on agreement. */
  async function replanOutfit(event: PlannedEventDto, edit: OutfitEdit) {
    if (!event.outfit) return;
    setEditingId(event.id);
    if (edit.mode === "swap") setSwapItemId(edit.itemId);
    try {
      const response = await fetch(`/api/aura/calendar/events/${event.id}/replan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION, ...edit }),
      });
      const body = (await response.json().catch(() => null)) as PlanResponse | null;

      if (response.status === 403 && body?.code === "consent-required") {
        pendingReplanRef.current = { event, edit };
        setShowDisclosure(true);
        return;
      }
      if (!response.ok || !body?.outfit) {
        toast.error(
          edit.mode === "swap"
            ? "We couldn't swap that piece"
            : "We couldn't regenerate this outfit",
          { description: body?.error ?? "Please try again." },
        );
        return;
      }

      const outfit = body.outfit;
      setEvents((current) =>
        current.map((candidate) =>
          candidate.id === event.id ? { ...candidate, outfit } : candidate,
        ),
      );
      toast.success(edit.mode === "swap" ? "Piece swapped" : "Outfit regenerated");
    } catch {
      toast.error(
        edit.mode === "swap"
          ? "We couldn't swap that piece"
          : "We couldn't regenerate this outfit",
        { description: "Please try again." },
      );
    } finally {
      setEditingId((current) => (current === event.id ? null : current));
      setSwapItemId(null);
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
        <Button
          type="button"
          variant="cta-flat"
          onClick={() => openAdd(today ?? "")}
          disabled={!today}
          className="rounded-full"
        >
          <CalendarPlus />
          Add event
        </Button>
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

      {/* Smart Planning invite — shown inline before the first outside contact,
          only when there is a placed event whose weather we could fetch. */}
      {hasPlacedInView && consentActive === false ? (
        <SmartPlanningBanner onTurnOn={() => setShowDisclosure(true)} />
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
                planningId={planningId}
                editingId={editingId}
                swapItemId={swapItemId}
                onAdd={() => openAdd(day)}
                onDelete={deleteEvent}
                onPlan={planOutfit}
                onReplan={replanOutfit}
              />
            ))
          )}
        </div>
      )}

      {/* Style Preference capture — an optional free-text note the planner leans
          on later. Purely local content (no egress), so it sits outside the
          Smart Planning gate. */}
      <StylePreferenceCard />

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

      {adding ? (
        <AddEventDialog
          defaultDate={addFor}
          onClose={() => setAdding(false)}
          onCreated={(event) => {
            setAdding(false);
            // Refetch so the new event lands in the right day even if it falls in
            // a different week than the one on screen.
            setRefresh((value) => value + 1);
            toast.success("Event added", { description: event.title });
          }}
        />
      ) : null}

      {showDisclosure ? (
        <SmartPlanningDisclosure
          onAgree={() => void enableSmartPlanning()}
          onCancel={() => {
            pendingPlanRef.current = null;
            pendingReplanRef.current = null;
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
  planningId,
  editingId,
  swapItemId,
  onAdd,
  onDelete,
  onPlan,
  onReplan,
}: {
  date: CivilDate;
  today: CivilDate;
  events: PlannedEventDto[];
  loading: boolean;
  weatherEnabled: boolean;
  planningId: string | null;
  editingId: string | null;
  swapItemId: string | null;
  onAdd: () => void;
  onDelete: (event: PlannedEventDto) => void;
  onPlan: (event: PlannedEventDto) => void;
  onReplan: (event: PlannedEventDto, edit: OutfitEdit) => void;
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
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                weatherEnabled={weatherEnabled && !past}
                canPlan={!past}
                planning={planningId === event.id}
                editing={editingId === event.id}
                swapItemId={editingId === event.id ? swapItemId : null}
                onDelete={() => onDelete(event)}
                onPlan={() => onPlan(event)}
                onReplan={(edit) => onReplan(event, edit)}
              />
            </li>
          ))}
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

function EventCard({
  event,
  weatherEnabled,
  canPlan,
  planning,
  editing,
  swapItemId,
  onDelete,
  onPlan,
  onReplan,
}: {
  event: PlannedEventDto;
  weatherEnabled: boolean;
  canPlan: boolean;
  planning: boolean;
  editing: boolean;
  swapItemId: string | null;
  onDelete: () => void;
  onPlan: () => void;
  onReplan: (edit: OutfitEdit) => void;
}) {
  return (
    <article className="border-border bg-card group flex items-start justify-between gap-3 rounded-xl border p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-heading truncate text-base tracking-wide uppercase">
            {event.title}
          </h3>
          {event.source === "google" ? (
            <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
              Google
            </span>
          ) : null}
        </div>
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {formatEventTime(event)}
          </span>
          {event.placeText ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{event.placeText}</span>
            </span>
          ) : null}
        </div>
        {event.placeText ? (
          <EventWeather eventId={event.id} enabled={weatherEnabled} />
        ) : null}
        {event.occasion ? (
          <span className="bg-muted text-muted-foreground mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium">
            {event.occasion}
          </span>
        ) : null}

        {event.outfit ? (
          <PlannedOutfitView
            outfit={event.outfit}
            canEdit={canPlan}
            editing={editing}
            swapItemId={swapItemId}
            onReplan={onReplan}
          />
        ) : canPlan ? (
          <PlanOutfitButton planning={planning} onPlan={onPlan} />
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        aria-label={`Delete ${event.title}`}
        className="text-muted-foreground hover:text-destructive shrink-0"
      >
        <Trash2 className="size-4" />
      </Button>
    </article>
  );
}

/** The per-event "Plan this outfit" action, shown on an unplanned, non-past
 *  event. Clicking it runs one AI planner call (raising the Smart Planning
 *  disclosure first if consent isn't active yet). */
function PlanOutfitButton({
  planning,
  onPlan,
}: {
  planning: boolean;
  onPlan: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onPlan}
      disabled={planning}
      className="mt-3 rounded-full"
    >
      {planning ? (
        <>
          <Loader2 className="animate-spin" />
          Planning…
        </>
      ) : (
        <>
          <Sparkles />
          Plan this outfit
        </>
      )}
    </Button>
  );
}

/** A planned outfit inline in the event row: wardrobe-item tiles, the AURA
 *  rationale, amber gap chips for anything the wardrobe couldn't cover, and — when
 *  editable — inline Regenerate / Swap actions (#178). Each tile carries its own
 *  hover Swap affordance; Regenerate redoes the whole pick. */
function PlannedOutfitView({
  outfit,
  canEdit,
  editing,
  swapItemId,
  onReplan,
}: {
  outfit: PlannedOutfitDto;
  canEdit: boolean;
  editing: boolean;
  swapItemId: string | null;
  onReplan: (edit: OutfitEdit) => void;
}) {
  // A Regenerate is in flight when the outfit is editing but no specific tile is.
  const regenerating = editing && swapItemId === null;

  return (
    <div className="mt-3 space-y-2">
      {outfit.items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {outfit.items.map((item) => (
            <li key={item.id}>
              <OutfitItemTile
                item={item}
                canSwap={canEdit && outfit.items.length > 1}
                swapping={swapItemId === item.id}
                disabled={editing}
                onSwap={() => onReplan({ mode: "swap", itemId: item.id })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {outfit.rationale ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs text-pretty">
          <Shirt className="text-brand-magenta mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{outfit.rationale}</span>
        </p>
      ) : null}

      {outfit.gaps.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {outfit.gaps.map((gap, index) => (
            <li key={`${gap.slot}-${index}`}>
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

      {canEdit ? (
        <div className="pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onReplan({ mode: "regenerate" })}
            disabled={editing}
            className="text-muted-foreground hover:text-brand-magenta h-7 gap-1.5 rounded-full px-2.5 text-xs"
          >
            {regenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw className="size-3.5" />
                Regenerate
              </>
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One wardrobe-item tile in a planned outfit. It fetches its own short-lived,
 *  server-authorized media URL — the browser never receives a durable asset URL —
 *  exactly as the wardrobe gallery does. When the outfit is editable it carries a
 *  hover/focus Swap affordance that replaces just this piece (#178). */
function OutfitItemTile({
  item,
  canSwap = false,
  swapping = false,
  disabled = false,
  onSwap,
}: {
  item: PlannedOutfitDto["items"][number];
  canSwap?: boolean;
  swapping?: boolean;
  disabled?: boolean;
  onSwap?: () => void;
}) {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    async function loadImage() {
      try {
        const response = await fetch(`/api/wardrobe/${item.id}/media?variant=normalized`, {
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as { url?: string } | null;
        if (!controller.signal.aborted && response.ok && body?.url) setImageUrl(body.url);
      } catch {
        // A missing tile image is non-fatal — the label still identifies the piece.
      }
    }
    void loadImage();
    return () => controller.abort();
  }, [item.id]);

  return (
    <div className="group/tile w-16" title={`${item.name} · ${item.color}`}>
      <div className="bg-muted relative aspect-square w-16 overflow-hidden rounded-lg border">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a durable asset
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        ) : (
          <div className="size-full animate-pulse" aria-hidden="true" />
        )}
        {canSwap ? (
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled}
            aria-label={`Swap ${item.name}`}
            className="bg-brand-ink/55 focus-visible:ring-ring absolute inset-0 grid place-items-center text-white opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-0"
          >
            {swapping ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Replace className="size-4" />
            )}
          </button>
        ) : null}
        {swapping && !canSwap ? (
          <div className="bg-brand-ink/55 absolute inset-0 grid place-items-center text-white">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : null}
      </div>
      <p className="text-muted-foreground mt-1 truncate text-[10px]">{item.name}</p>
    </div>
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

/** The versioned, just-in-time Smart Planning disclosure. It appears before the
 *  first outside contact and, on agreement, records consent for the disclosed
 *  policy version — after which weather may be fetched. */
function SmartPlanningDisclosure({
  onAgree,
  onCancel,
}: {
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
        aria-labelledby="smart-planning-disclosure-title"
        className="bg-card text-card-foreground w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-7"
      >
        <h2
          id="smart-planning-disclosure-title"
          className="font-heading text-2xl tracking-wide uppercase"
        >
          Turn on Smart Planning
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
          {SMART_PLANNING_DISCLOSURE}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Not now
          </Button>
          <Button type="button" onClick={onAgree}>
            Turn on Smart Planning
          </Button>
        </div>
      </section>
    </div>
  );
}

function AddEventDialog({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: CivilDate | null;
  onClose: () => void;
  onCreated: (event: PlannedEventDto) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<PlannedEventFormInput>({
    resolver: zodResolver(plannedEventFormSchema),
    defaultValues: {
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

  async function onSubmit(values: PlannedEventFormInput) {
    const payload = {
      title: values.title,
      occasion: values.occasion,
      allDay: values.allDay,
      startsAt: toInstant(values.startsAtLocal, values.allDay),
      endsAt: values.endsAtLocal
        ? toInstant(values.endsAtLocal, values.allDay)
        : undefined,
      placeText: values.placeText,
    };

    let response: Response;
    try {
      response = await fetch("/api/aura/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      toast.error("Couldn't reach the server", {
        description: "Check your connection and try again.",
      });
      return;
    }

    const body = (await response.json().catch(() => null)) as EventResponse | null;
    if (!response.ok || !body?.event) {
      toast.error("We couldn't add your event", {
        description: body?.error ?? "Please try again.",
      });
      return;
    }

    onCreated(body.event);
  }

  const fieldClass =
    "focus-visible:border-brand-magenta focus-visible:ring-brand-magenta/30 h-11 rounded-xl px-4";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add an event"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-brand-ink/60 p-4 backdrop-blur-sm"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section className="bg-card text-card-foreground my-auto w-full max-w-lg rounded-3xl border p-6 shadow-2xl sm:p-8">
        <h2 className="font-heading text-brand-magenta text-2xl tracking-wide uppercase sm:text-3xl">
          Add an event
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
            <Input
              id="event-place"
              className={fieldClass}
              placeholder="e.g. Bandra, or a venue name"
              aria-invalid={!!errors.placeText}
              {...register("placeText")}
            />
            <FieldError message={errors.placeText?.message} />
          </div>

          <div className="mt-1 flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-brand-magenta text-brand-magenta-foreground rounded-full px-6 hover:brightness-105"
            >
              {isSubmitting ? "Adding…" : "Add event"}
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
