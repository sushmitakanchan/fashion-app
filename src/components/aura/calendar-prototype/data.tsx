/**
 * Throwaway mock data + shared leaf pieces for the Outfit Calendar week-view
 * prototype (#162). Shapes mirror the locked domain model (#156) and AI-planning
 * contract (#161): a PlannedEvent (title/occasion/when/place/source) carries
 * 0..1 PlannedOutfit (a set of live wardrobe items + rationale + gap flags).
 * Weather is live-per-event, never persisted (#156) — here it is mocked.
 *
 * Not production code: garment tiles are colour swatches, not real next/image
 * Cloudinary thumbnails; actions are stubs. The design under review is layout,
 * hierarchy, and affordances — not the data path.
 */
import * as React from "react";
import {
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
  Cloud,
  MapPin,
  CalendarDays,
} from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (prototype-local mirrors of the domain model)
// ---------------------------------------------------------------------------

export type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  /** CSS colour standing in for the real Cloudinary garment thumbnail. */
  swatch: string;
};

export type Weather = {
  kind: "sun" | "cloud-sun" | "cloud" | "rain" | "snow";
  tempC: number;
  summary: string;
};

export type Gap = { slot: string; note: string };

export type PlannedOutfit = {
  items: WardrobeItem[];
  rationale: string;
  gaps: Gap[];
  provenance: "ai_planned" | "user_edited";
  /** Cached try-on preview (#156). null = not generated yet. */
  previewReady: boolean;
};

export type PlannedEvent = {
  id: string;
  title: string;
  occasion: string;
  time: string; // display string; allDay events use "All day"
  place: string | null;
  weather: Weather | null;
  source: "manual" | "google";
  /** 0..1 outfit; null = not planned yet (empty state). */
  outfit: PlannedOutfit | null;
};

export type PlannedDay = {
  key: string;
  weekday: string;
  date: string; // e.g. "Aug 10"
  highLow: string; // day weather summary
  events: PlannedEvent[];
};

// ---------------------------------------------------------------------------
// Mock wardrobe pieces
// ---------------------------------------------------------------------------

const I = (id: string, name: string, category: string, swatch: string): WardrobeItem => ({
  id,
  name,
  category,
  swatch,
});

const navyBlazer = I("w1", "Navy blazer", "outerwear", "#26324a");
const whiteTee = I("w2", "White tee", "tops", "#f2efe9");
const darkJeans = I("w3", "Dark jeans", "bottoms", "#2b3446");
const whiteSneakers = I("w4", "White sneakers", "shoes", "#e9e6df");
const blackMidi = I("w5", "Black midi dress", "dresses", "#1b1b1e");
const heels = I("w6", "Black heels", "shoes", "#141317");
const trench = I("w7", "Camel trench", "outerwear", "#b08d57");
const silkBlouse = I("w8", "Ivory silk blouse", "tops", "#eee7d6");
const tailoredTrousers = I("w9", "Charcoal trousers", "bottoms", "#3a3a3f");
const gymTop = I("w10", "Running top", "activewear", "#3b7a68");
const joggers = I("w11", "Grey joggers", "activewear", "#8a8f96");
const trainers = I("w12", "Trainers", "shoes", "#d64d3f");
const linenShirt = I("w13", "Linen shirt", "tops", "#cfe0e6");
const goldEarrings = I("w14", "Gold earrings", "accessories", "#c9a24a");
const structuredBag = I("w15", "Structured bag", "bags", "#5c4636");

// ---------------------------------------------------------------------------
// The mock week — engineered to exercise every state
// ---------------------------------------------------------------------------

export const MOCK_WEEK: PlannedDay[] = [
  {
    key: "mon",
    weekday: "Mon",
    date: "Aug 10",
    highLow: "24° / 15°",
    events: [
      {
        id: "e1",
        title: "Team standup",
        occasion: "Work",
        time: "9:00 AM",
        place: "Studio, Bengaluru",
        weather: { kind: "sun", tempC: 24, summary: "Sunny" },
        source: "manual",
        outfit: {
          items: [whiteTee, navyBlazer, darkJeans, whiteSneakers],
          rationale: "Smart-casual for the office; blazer sharpens the tee.",
          gaps: [],
          provenance: "ai_planned",
          previewReady: true,
        },
      },
    ],
  },
  {
    key: "tue",
    weekday: "Tue",
    date: "Aug 11",
    highLow: "26° / 16°",
    events: [], // empty day
  },
  {
    key: "wed",
    weekday: "Wed",
    date: "Aug 12",
    highLow: "21° / 14°",
    events: [
      {
        id: "e2",
        title: "Client pitch",
        occasion: "Business formal",
        time: "11:00 AM",
        place: "MG Road",
        weather: { kind: "cloud", tempC: 19, summary: "Overcast" },
        source: "manual",
        outfit: {
          items: [silkBlouse, tailoredTrousers, heels, structuredBag],
          rationale: "Polished, neutral palette — reads senior in the room.",
          gaps: [],
          provenance: "ai_planned",
          previewReady: false,
        },
      },
      {
        id: "e3",
        title: "Dinner with Sam",
        occasion: "Date night",
        time: "8:00 PM",
        place: "Rooftop, Indiranagar",
        weather: { kind: "cloud-sun", tempC: 21, summary: "Clear evening" },
        source: "google",
        outfit: {
          items: [blackMidi, heels, goldEarrings],
          rationale: "Evening-out from your wardrobe; earrings lift it.",
          gaps: [],
          provenance: "user_edited",
          previewReady: true,
        },
      },
    ],
  },
  {
    key: "thu",
    weekday: "Thu",
    date: "Aug 13",
    highLow: "18° / 13°",
    events: [
      {
        id: "e4",
        title: "Morning run + coffee",
        occasion: "Casual",
        time: "7:00 AM",
        place: "Cubbon Park",
        weather: { kind: "rain", tempC: 16, summary: "Light rain" },
        source: "manual",
        outfit: {
          items: [gymTop, joggers, trainers],
          rationale: "Active fit; light rain, nothing precious.",
          gaps: [],
          provenance: "ai_planned",
          previewReady: false,
        },
      },
    ],
  },
  {
    key: "fri",
    weekday: "Fri",
    date: "Aug 14",
    highLow: "13° / 8°",
    events: [
      {
        id: "e5",
        title: "Board presentation",
        occasion: "Business formal",
        time: "10:00 AM",
        place: "HQ, Whitefield",
        weather: { kind: "snow", tempC: 11, summary: "Cold snap" },
        source: "manual",
        outfit: {
          // partial + gaps → "needs attention" state
          items: [silkBlouse, tailoredTrousers],
          rationale: "Best formal top + trousers you own — but it's cold.",
          gaps: [
            { slot: "formal shoes", note: "No formal shoes in your wardrobe." },
            { slot: "warm layer", note: "Nothing warm enough for 11°." },
          ],
          provenance: "ai_planned",
          previewReady: false,
        },
      },
    ],
  },
  {
    key: "sat",
    weekday: "Sat",
    date: "Aug 15",
    highLow: "27° / 18°",
    events: [
      {
        id: "e6",
        title: "Weekend brunch",
        occasion: "Casual",
        time: "12:00 PM",
        place: "Koramangala",
        weather: { kind: "sun", tempC: 26, summary: "Warm & sunny" },
        source: "google", // imported, not yet planned
        outfit: null,
      },
    ],
  },
  {
    key: "sun",
    weekday: "Sun",
    date: "Aug 16",
    highLow: "25° / 17°",
    events: [], // empty day
  },
];

export const WEEK_RANGE = "Aug 10 – 16, 2026";

/** Handy references for prose / rail summaries. */
export const spareItems = [trench, linenShirt];

// ---------------------------------------------------------------------------
// Shared leaf pieces — small enough to share; each variant lays them out itself
// ---------------------------------------------------------------------------

const WEATHER_ICON = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  snow: Snowflake,
} as const;

export function WeatherChip({
  weather,
  className,
}: {
  weather: Weather;
  className?: string;
}) {
  const Icon = WEATHER_ICON[weather.kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {weather.tempC}° · {weather.summary}
    </span>
  );
}

export function OccasionBadge({ occasion }: { occasion: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold tracking-wide text-foreground uppercase">
      {occasion}
    </span>
  );
}

export function SourceBadge({ source }: { source: PlannedEvent["source"] }) {
  if (source !== "google") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400"
      title="Imported from Google Calendar"
    >
      <CalendarDays className="size-3" aria-hidden /> Google
    </span>
  );
}

export function PlaceLine({ place }: { place: string | null }) {
  if (!place) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MapPin className="size-3.5" aria-hidden /> {place}
    </span>
  );
}

/** A garment thumbnail. `size` scales the swatch across variants. */
export function ItemChip({
  item,
  size = "md",
  showLabel = true,
}: {
  item: WardrobeItem;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const dim = size === "lg" ? "size-16" : size === "sm" ? "size-8" : "size-11";
  return (
    <figure className={cn("flex flex-col items-center gap-1", size === "lg" && "gap-1.5")}>
      <span
        className={cn(
          "block rounded-lg border border-border shadow-sm ring-1 ring-black/5",
          dim,
        )}
        style={{ background: item.swatch }}
        title={`${item.name} · ${item.category}`}
        aria-label={`${item.name}, ${item.category}`}
      />
      {showLabel && (
        <figcaption className="max-w-[4.5rem] truncate text-center text-[10px] leading-tight text-muted-foreground">
          {item.name}
        </figcaption>
      )}
    </figure>
  );
}

export function GapChip({ gap }: { gap: Gap }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
      title={gap.note}
    >
      ⚠ {gap.slot}
    </span>
  );
}
