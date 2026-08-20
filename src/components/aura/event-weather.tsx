"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "lucide-react";

import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import type { WeatherGroup } from "@/lib/weather-code";
import type { WeatherStatus } from "@/lib/weather";
import { cn } from "@/lib/utils";

/**
 * One placed event's weather, as the calendar and the event-detail Rack both read
 * it. Extracted from the calendar surface so the two surfaces share ONE query (a
 * single cached fetch per event) and one egress contract — the weather call is
 * gated on active Smart Planning consent, and echoes the disclosed policy version
 * the boundary refuses to answer without.
 */
export type EventWeatherResponse = {
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

export const WEATHER_ICON: Record<WeatherGroup, typeof Cloud> = {
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

export function fmtTemp(value: number): string {
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
 *  Keyed by event id so every surface that shows this event's weather dedupes to
 *  one fetch. */
export function useEventWeather(eventId: string, enabled: boolean) {
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
export function TicketField({
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
export function EventWeather({ eventId, enabled }: { eventId: string; enabled: boolean }) {
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
export function DayHighLow({ eventId, enabled }: { eventId: string; enabled: boolean }) {
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
