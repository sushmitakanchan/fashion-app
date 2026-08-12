import "server-only";

import { describeWeatherCode, type WeatherDescription } from "@/lib/weather-code";

/**
 * Live weather for one placed event's day via **Open-Meteo forecast** — the
 * second half of the calendar's outside contact, reached only after the Smart
 * Planning consent boundary allows egress and the place has been geocoded.
 *
 * Weather is **never persisted** (spec §2, §8): this returns a transient value
 * the calendar renders and the client caches briefly. Only the daily fields the
 * agenda shows are requested, narrowed to the single event day so the response
 * stays small. `weather_code` is a WMO code with no text — `weather-code.ts`
 * owns the words. Coordinates only ever reach here; the event title cannot,
 * because the function has no parameter for it.
 */

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/** How far ahead Open-Meteo's free forecast reaches. The single source lives in
 *  the client-safe planner module (the re-plan nudge needs it too); re-exported
 *  here so the server weather/plan routes keep importing it from `@/lib/weather`. */
export { WEATHER_FORECAST_HORIZON_DAYS } from "@/lib/aura-outfit-planner";

export type DayWeather = {
  /** The place-local civil date this forecast is for (YYYY-MM-DD). */
  date: string;
  /** The raw WMO code, so the client can pick its own icon/label if it prefers. */
  weatherCode: number;
  /** The interpreted label + icon group for the code. */
  description: WeatherDescription;
  temperatureMax: number;
  temperatureMin: number;
  /** Max chance of precipitation for the day, or null when unavailable. */
  precipitationProbabilityMax: number | null;
};

/** Why a day's forecast is or isn't available: present (`ok`), past the free
 *  forecast window (`beyond-horizon`), or a transient provider failure
 *  (`unavailable`). Shared by the route and the client so the three states can't
 *  drift out of sync across the boundary. */
export type WeatherStatus = "ok" | "beyond-horizon" | "unavailable";

export type WeatherOutcome =
  | { status: "ok"; weather: DayWeather }
  | { status: "beyond-horizon" }
  | { status: "unavailable" };

/** Coerce an Open-Meteo array cell to a finite number, or null. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type ForecastResponse = {
  daily?: {
    time?: unknown[];
    weather_code?: unknown[];
    temperature_2m_max?: unknown[];
    temperature_2m_min?: unknown[];
    precipitation_probability_max?: unknown[];
  };
};

/**
 * Fetch the daily forecast for a single place-local date. Returns
 * `beyond-horizon` when the provider has no forecast for that day (a far-future
 * date comes back as a 400 or an empty daily block), and `unavailable` on any
 * transport or shape failure — never throws, so one event's missing weather
 * never breaks the agenda.
 */
export async function fetchDayWeather(params: {
  latitude: number;
  longitude: number;
  timezone?: string | null;
  /** The place-local civil date to fetch (YYYY-MM-DD). */
  date: string;
  signal?: AbortSignal;
}): Promise<WeatherOutcome> {
  const { latitude, longitude, timezone, date, signal } = params;

  const url = new URL(FORECAST_ENDPOINT);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  );
  // Bucket the forecast into the place's own days, so an evening event still
  // reads the right calendar day at the venue rather than the server's.
  url.searchParams.set("timezone", timezone && timezone.length > 0 ? timezone : "auto");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch {
    return { status: "unavailable" };
  }
  if (!response.ok) {
    // Out-of-range dates come back 400; anything else is a genuine outage.
    return response.status === 400
      ? { status: "beyond-horizon" }
      : { status: "unavailable" };
  }

  const json = (await response.json().catch(() => null)) as ForecastResponse | null;
  const daily = json?.daily;
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    return { status: "beyond-horizon" };
  }

  const weatherCode = num(daily.weather_code?.[0]);
  const temperatureMax = num(daily.temperature_2m_max?.[0]);
  const temperatureMin = num(daily.temperature_2m_min?.[0]);
  const forecastDate = daily.time[0];
  if (
    weatherCode === null ||
    temperatureMax === null ||
    temperatureMin === null ||
    typeof forecastDate !== "string"
  ) {
    return { status: "unavailable" };
  }

  return {
    status: "ok",
    weather: {
      date: forecastDate,
      weatherCode,
      description: describeWeatherCode(weatherCode),
      temperatureMax,
      temperatureMin,
      precipitationProbabilityMax: num(daily.precipitation_probability_max?.[0]),
    },
  };
}
