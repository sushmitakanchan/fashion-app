/**
 * WMO weather-code interpretation, client-safe and pure.
 *
 * Open-Meteo's forecast returns a numeric **WMO code** and no text — the mapping
 * to human words and an icon family is ours to own. This module is deliberately
 * dependency-free and free of `server-only`, so the same table drives the
 * server's compact summary and the calendar's per-event icon without pulling any
 * server code into the browser bundle (mirroring how the consent policy text
 * lives in a client-safe module).
 */

/** The icon family a code belongs to. The UI maps each group to one glyph; the
 *  server never needs the glyph, only the label. `unknown` covers any code the
 *  table doesn't recognise, so a future WMO addition degrades to a dash rather
 *  than a crash. */
export type WeatherGroup =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "showers"
  | "thunderstorm"
  | "unknown";

export type WeatherDescription = {
  /** Short human label for the code, e.g. "Partly cloudy". */
  label: string;
  /** The icon family, for the client to pick a glyph from. */
  group: WeatherGroup;
};

// The standard WMO code set Open-Meteo emits. Kept as a flat table (not ranges)
// so each code's label and group are explicit and greppable.
const WEATHER_CODES: Record<number, WeatherDescription> = {
  0: { label: "Clear sky", group: "clear" },
  1: { label: "Mainly clear", group: "clear" },
  2: { label: "Partly cloudy", group: "partly-cloudy" },
  3: { label: "Overcast", group: "cloudy" },
  45: { label: "Fog", group: "fog" },
  48: { label: "Rime fog", group: "fog" },
  51: { label: "Light drizzle", group: "drizzle" },
  53: { label: "Drizzle", group: "drizzle" },
  55: { label: "Heavy drizzle", group: "drizzle" },
  56: { label: "Freezing drizzle", group: "drizzle" },
  57: { label: "Heavy freezing drizzle", group: "drizzle" },
  61: { label: "Light rain", group: "rain" },
  63: { label: "Rain", group: "rain" },
  65: { label: "Heavy rain", group: "rain" },
  66: { label: "Freezing rain", group: "rain" },
  67: { label: "Heavy freezing rain", group: "rain" },
  71: { label: "Light snow", group: "snow" },
  73: { label: "Snow", group: "snow" },
  75: { label: "Heavy snow", group: "snow" },
  77: { label: "Snow grains", group: "snow" },
  80: { label: "Light showers", group: "showers" },
  81: { label: "Showers", group: "showers" },
  82: { label: "Violent showers", group: "showers" },
  85: { label: "Light snow showers", group: "snow" },
  86: { label: "Heavy snow showers", group: "snow" },
  95: { label: "Thunderstorm", group: "thunderstorm" },
  96: { label: "Thunderstorm with hail", group: "thunderstorm" },
  99: { label: "Severe thunderstorm with hail", group: "thunderstorm" },
};

const UNKNOWN: WeatherDescription = { label: "—", group: "unknown" };

/** Interpret a WMO weather code. An unrecognised code degrades to a neutral
 *  dash rather than throwing, so an unexpected value never breaks the agenda. */
export function describeWeatherCode(code: number): WeatherDescription {
  return WEATHER_CODES[code] ?? UNKNOWN;
}
