"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
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
  Eye,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Replace,
  RotateCcw,
  Settings2,
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
import {
  planWeekSequentially,
  shouldSuggestReplan,
  type PlannedOutfitDto,
} from "@/lib/aura-outfit-planner";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
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
import { shortPlaceLabel } from "@/lib/calendar-place";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartPlanningDisclosure } from "@/components/aura/smart-planning-disclosure";
import { GoogleCalendarConnect } from "@/components/aura/google-calendar-connect";
import {
  AuraPortraitLoading,
  TRY_ON_CAPTIONS,
} from "@/components/aura/aura-portrait-loading";

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

/** One stencilled field on the ticket: a small uppercase label over its value.
 *  Time, place and weather all read as the same kind of thing this way. */
function TicketField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-muted-foreground font-mono text-[0.6rem] tracking-[0.16em] uppercase">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">{children}</span>
    </div>
  );
}

/** The weather field on the ticket: icon · high/low, with honest fallbacks for
 *  an unlocatable place or a date past the forecast horizon. A coarsened match
 *  still names the place it actually resolved to, so the calendar never
 *  silently attaches a broader place's weather to a venue it couldn't pinpoint. */
function EventWeather({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const { data, isLoading, isError } = useEventWeather(eventId, enabled);

  if (!enabled) return null;
  if (isLoading) {
    return (
      <TicketField label="Weather">
        <span className="bg-muted h-4 w-16 animate-pulse rounded" aria-hidden="true" />
      </TicketField>
    );
  }
  if (isError || !data || data.placed === false) return null;

  if (data.unresolved) {
    return (
      <TicketField label="Weather">
        <span className="text-muted-foreground font-normal">Place not found</span>
      </TicketField>
    );
  }

  const weather = data.weather;
  if (!weather) {
    const note =
      data.weatherStatus === "beyond-horizon" ? "Not forecast yet" : "Unavailable";
    return (
      <TicketField label="Weather">
        <span className="text-muted-foreground font-normal">{note}</span>
      </TicketField>
    );
  }

  const Icon = WEATHER_ICON[weather.description.group] ?? Cloud;
  const precip = weather.precipitationProbabilityMax;
  const placeLabel = data.place?.placeLabel;

  return (
    <TicketField label="Weather">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">
        {fmtTemp(weather.temperatureMax)} / {fmtTemp(weather.temperatureMin)}
      </span>
      <span className="text-muted-foreground truncate font-normal">
        {weather.description.label}
        {typeof precip === "number" && precip >= 40 ? ` · ${precip}% rain` : ""}
        {placeLabel && data.approximate ? ` · nearest match: ${placeLabel}` : ""}
      </span>
    </TicketField>
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
  // Sequential "Plan my week" progress (null when not running), and a pending
  // flag so a week plan blocked on consent resumes once Smart Planning is on.
  const [weekPlan, setWeekPlan] = React.useState<{ done: number; total: number } | null>(
    null,
  );
  const pendingWeekRef = React.useRef(false);
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
      // Resume whatever raised the disclosure: a single "Plan this outfit", a
      // whole-week "Plan my week", or an inline Regenerate/Swap.
      const pendingEvent = pendingPlanRef.current;
      const pendingWeek = pendingWeekRef.current;
      const pendingReplan = pendingReplanRef.current;
      pendingPlanRef.current = null;
      pendingWeekRef.current = false;
      pendingReplanRef.current = null;
      if (pendingWeek) void planWeek();
      else if (pendingEvent) void planOutfit(pendingEvent);
      else if (pendingReplan) void replanOutfit(pendingReplan.event, pendingReplan.edit);
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

  type PlanResult =
    | { outfit: PlannedOutfitDto }
    | { consentRequired: true }
    | { error: string };

  /** One planner exchange: POST the event's plan with the echoed policy version
   *  and, for a week pass, the ids already committed to earlier events. Shared by
   *  the single-event action and the sequential week plan so the request contract
   *  can't drift between them. */
  async function requestPlan(
    event: PlannedEventDto,
    priorItemIds: readonly string[],
  ): Promise<PlanResult> {
    const response = await fetch(`/api/aura/calendar/events/${event.id}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ policyVersion: PLANNING_POLICY_VERSION, priorItemIds }),
    });
    const body = (await response.json().catch(() => null)) as PlanResponse | null;
    if (response.status === 403 && body?.code === "consent-required") {
      return { consentRequired: true };
    }
    if (!response.ok || !body?.outfit) {
      return { error: body?.error ?? "Please try again." };
    }
    return { outfit: body.outfit };
  }

  /** Plan one event's outfit with a single AI call, gated by Smart Planning
   *  consent. If consent isn't active yet, the route replies 403 and we raise the
   *  disclosure, resuming this plan on agreement. */
  async function planOutfit(event: PlannedEventDto) {
    setPlanningId(event.id);
    try {
      const result = await requestPlan(event, []);
      if ("consentRequired" in result) {
        pendingPlanRef.current = event;
        setShowDisclosure(true);
        return;
      }
      if ("error" in result) {
        toast.error("We couldn't plan this outfit", { description: result.error });
        return;
      }
      injectOutfit(event.id, result.outfit);
      toast.success("Outfit planned", {
        description:
          result.outfit.items.length > 0
            ? `${result.outfit.items.length} ${result.outfit.items.length === 1 ? "piece" : "pieces"} from your wardrobe`
            : "AURA flagged a wardrobe gap.",
      });
    } catch {
      toast.error("We couldn't plan this outfit", { description: "Please try again." });
    } finally {
      setPlanningId((current) => (current === event.id ? null : current));
    }
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
          const result = await requestPlan(event, priorItemIds);
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

      injectOutfit(event.id, body.outfit);
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
                tz={tz}
                events={eventsByDay.get(day) ?? []}
                loading={loading}
                weatherEnabled={weatherEnabled}
                planningId={planningId}
                weekPlanning={weekPlan !== null}
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
  tz,
  events,
  loading,
  weatherEnabled,
  planningId,
  weekPlanning,
  editingId,
  swapItemId,
  onAdd,
  onDelete,
  onPlan,
  onReplan,
}: {
  date: CivilDate;
  today: CivilDate;
  tz: string;
  events: PlannedEventDto[];
  loading: boolean;
  weatherEnabled: boolean;
  planningId: string | null;
  weekPlanning: boolean;
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
                eventDate={date}
                today={today}
                tz={tz}
                weatherEnabled={weatherEnabled && !past}
                canPlan={!past}
                planning={planningId === event.id}
                weekPlanning={weekPlanning}
                editing={editingId === event.id}
                swapItemId={editingId === event.id ? swapItemId : null}
                onDelete={() => onDelete(event)}
                onPlan={() => onPlan(event)}
                onReplan={(edit) => onReplan(event, edit)}
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

function EventCard({
  event,
  eventDate,
  today,
  tz,
  weatherEnabled,
  canPlan,
  planning,
  weekPlanning,
  editing,
  swapItemId,
  onDelete,
  onPlan,
  onReplan,
}: {
  event: PlannedEventDto;
  eventDate: CivilDate;
  today: CivilDate;
  tz: string;
  weatherEnabled: boolean;
  canPlan: boolean;
  planning: boolean;
  weekPlanning: boolean;
  editing: boolean;
  swapItemId: string | null;
  onDelete: () => void;
  onPlan: () => void;
  onReplan: (edit: OutfitEdit) => void;
}) {
  // Storage-free re-plan nudge: an already-planned, placed event that was planned
  // weather-less but has since entered the forecast window. Derived from the
  // outfit's updatedAt — no weather is persisted to compute it.
  const showReplanNudge = Boolean(
    event.outfit &&
      canPlan &&
      shouldSuggestReplan({
        placed: Boolean(event.placeText),
        eventDate,
        outfitUpdatedDate: civilDateInTimeZone(new Date(event.outfit.updatedAt), tz),
        today,
      }),
  );

  return (
    <article className="border-border bg-card group rounded-xl border shadow-sm">
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

        {event.outfit ? (
          <PlannedOutfitView
            eventId={event.id}
            outfit={event.outfit}
            showReplanNudge={showReplanNudge}
            canEdit={canPlan}
            editing={editing}
            swapItemId={swapItemId}
            onReplan={onReplan}
          />
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
        {event.outfit ? (
          <span
            className="flex flex-none flex-col items-center gap-1"
            role="img"
            aria-label="Planned by AURA"
          >
            <span className="rotate-[-9deg] leading-none">
              <AuraSeal idSuffix={event.id} />
            </span>
            <span className="text-foreground font-mono text-[0.56rem] font-semibold tracking-[0.16em] uppercase">
              Planned by AURA
            </span>
          </span>
        ) : canPlan ? (
          <PlanOutfitButton planning={planning} disabled={weekPlanning} onPlan={onPlan} />
        ) : null}
      </div>
    </article>
  );
}

/** The per-event "Plan this outfit" action, shown on an unplanned, non-past
 *  event. Clicking it runs one AI planner call (raising the Smart Planning
 *  disclosure first if consent isn't active yet). */
function PlanOutfitButton({
  planning,
  disabled,
  onPlan,
}: {
  planning: boolean;
  disabled: boolean;
  onPlan: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onPlan}
      disabled={planning || disabled}
      className="rounded-full"
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
 *  rationale, amber gap chips for anything the wardrobe couldn't cover, the
 *  storage-free re-plan nudge, and — when editable — inline Regenerate / Swap
 *  actions (#178). Each tile carries its own hover Swap affordance; Regenerate
 *  redoes the whole pick. */
function PlannedOutfitView({
  eventId,
  outfit,
  showReplanNudge,
  canEdit,
  editing,
  swapItemId,
  onReplan,
}: {
  eventId: string;
  outfit: PlannedOutfitDto;
  showReplanNudge: boolean;
  canEdit: boolean;
  editing: boolean;
  swapItemId: string | null;
  onReplan: (edit: OutfitEdit) => void;
}) {
  // A Regenerate is in flight when the outfit is editing but no specific tile is.
  const regenerating = editing && swapItemId === null;

  return (
    <div className="mt-3 space-y-2">
      {/* On-demand try-on preview — the portrait wearing this outfit — foregrounded
          as the hero. Only offered when there's a pick to render (an all-gaps
          outfit has nothing to try on). A Regenerate/Swap that changes the item
          set clears previewImageUrl server-side (#178), so the cache is keyed on
          the current item set. */}
      {outfit.items.length > 0 ? (
        <OutfitPreview
          key={outfit.previewImageUrl ?? "none"}
          eventId={eventId}
          cachedPreviewUrl={outfit.previewImageUrl}
        />
      ) : null}
      {showReplanNudge ? (
        <p className="text-brand-magenta flex items-start gap-1.5 text-xs font-medium">
          <CloudSun className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>There&apos;s a forecast for this day now — re-plan to factor in the weather.</span>
        </p>
      ) : null}
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

type PreviewResponse = {
  previewImageUrl?: string;
  error?: string;
  retryable?: boolean;
};

/**
 * The on-demand try-on preview for one planned outfit: the saved portrait wearing
 * the outfit, generated server-side and cached to `previewImageUrl` (#169). The
 * outfit-id → preview binding is server-authoritative — this only offers the
 * trigger and shows the result. "Generate preview" (none yet) becomes "See
 * preview" once a preview is cached; "Regenerate preview" re-runs it in place
 * (distinct from the outfit-level Regenerate, which re-plans the pieces). While it
 * generates it reuses the try-on surface's darkroom loading + retry treatment
 * (up to ~2 minutes, per the generator's timeout).
 */
function OutfitPreview({
  eventId,
  cachedPreviewUrl,
}: {
  eventId: string;
  cachedPreviewUrl: string | null;
}) {
  const [previewUrl, setPreviewUrl] = React.useState(cachedPreviewUrl);
  // A cached preview stays collapsed behind "See preview"; a freshly generated
  // one reveals itself. (A cleared cache remounts this component — see the parent
  // `key` — so there's no stale state to reset here.)
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "generating" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState("");

  async function generate() {
    setPhase("generating");
    setOpen(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/aura/calendar/events/${eventId}/preview`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as PreviewResponse | null;
      if (!response.ok || !body?.previewImageUrl) {
        setPhase("error");
        setErrorMessage(body?.error ?? "We couldn't generate this preview. Please try again.");
        return;
      }
      setPreviewUrl(body.previewImageUrl);
      setPhase("idle");
    } catch {
      setPhase("error");
      setErrorMessage("Couldn't reach the server. Please try again.");
    }
  }

  const generating = phase === "generating";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {previewUrl && !open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="rounded-full"
          >
            <Eye />
            See preview
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void generate()}
            disabled={generating}
            className="rounded-full"
          >
            {generating ? (
              <>
                <Loader2 className="animate-spin" />
                Generating…
              </>
            ) : previewUrl ? (
              <>
                <RotateCcw />
                Regenerate preview
              </>
            ) : (
              <>
                <Sparkles />
                Generate preview
              </>
            )}
          </Button>
        )}
      </div>

      {open ? (
        <div className="mx-auto w-full max-w-xs">
          {generating ? (
            <AuraPortraitLoading
              title="Styling your preview"
              captions={TRY_ON_CAPTIONS}
              note="This can take up to ~2 minutes."
            />
          ) : phase === "error" ? (
            <div className="border-destructive/40 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
              <p className="text-sm font-medium">We couldn&apos;t generate this preview</p>
              <p className="text-muted-foreground text-xs text-pretty">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void generate()}
                className="rounded-full"
              >
                <RotateCcw />
                Try again
              </Button>
            </div>
          ) : previewUrl ? (
            <figure className="space-y-1.5">
              <div className="bg-muted aspect-[2/3] w-full overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary preview asset, kept off next/image to avoid a remote-host round-trip here */}
                <img
                  src={previewUrl}
                  alt="Your portrait wearing this outfit"
                  className="size-full object-cover"
                />
              </div>
              <figcaption className="text-muted-foreground text-center text-[11px]">
                Your portrait wearing this outfit
              </figcaption>
            </figure>
          ) : null}
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
