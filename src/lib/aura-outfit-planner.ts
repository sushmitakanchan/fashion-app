import { z } from "zod";

import { MAX_TRY_ON_GARMENTS } from "@/lib/validations";
import { civilDaysBetween, type CivilDate } from "@/lib/calendar-week";

/**
 * How far ahead Open-Meteo's free forecast reaches. An event beyond this is
 * planned weather-less; once it crosses into the window the calendar nudges a
 * re-plan ({@link shouldSuggestReplan}). Defined here — the one client-safe
 * planning module — so both the server weather lib (which re-exports it) and the
 * client-side re-plan nudge read a single source. Kept a touch under the
 * provider's ~16-day ceiling so an off-by-one near the edge degrades cleanly.
 */
export const WEATHER_FORECAST_HORIZON_DAYS = 15;

/**
 * Pure planning logic for the Outfit Calendar's per-event "Plan this outfit"
 * (spec #170 §3–§5, ticket #176). The server route owns the `generateText` call,
 * the Prisma reads/writes, and the consent boundary; everything here is
 * deterministic and side-effect-free so the load-bearing rules — the output
 * contract, id reconciliation, the honest-gap fallback, and the weather degrade —
 * are unit-testable without a model or a database.
 *
 * The privacy invariant is structural, not a runtime check: {@link buildPlannerPrompt}
 * has **no parameter for the event title**, exactly as the weather library takes
 * only coordinates. There is no path by which a title could reach the prompt.
 */

/** One active wardrobe item as fed to the planner — text only, no media. These
 *  are the ONLY ids the model may return; the route re-validates against them. */
export type PlannerWardrobeItem = {
  id: string;
  category: string;
  name: string;
  color: string;
  brand?: string | null;
  occasion?: string | null;
};

/** The compact live-weather input for the event window, or `null` to degrade.
 *  Deliberately not the server-only `DayWeather` type, so this module stays a
 *  pure, server-agnostic dependency the route maps onto. */
export type PlannerWeatherInput = {
  /** Interpreted conditions label, e.g. "Light rain". */
  label: string;
  temperatureMax: number;
  temperatureMin: number;
  /** Max chance of precipitation for the day (0–100), or null when unavailable. */
  precipitationProbabilityMax: number | null;
};

/**
 * The server-owned, strictly validated response contract for one planned outfit
 * (spec §3). Capping `itemIds` at {@link MAX_TRY_ON_GARMENTS} makes "every outfit
 * is previewable" an invariant — the try-on generator caps at the same number.
 * The string caps are generous so a valid-but-long reply parses rather than
 * 502-ing (the review-route lesson). An empty pick is legal **only** beside a
 * gap: a plan that chooses nothing must say why.
 */
/** One coverage gap: a slot the wardrobe truly can't fill for this event. */
export const plannerGapSchema = z.object({
  // e.g. "formal shoes", "rain layer".
  slot: z.string().trim().min(1).max(40),
  note: z.string().trim().min(1).max(160),
});

/** The gap list, on the AI output and (as JSON) on the persisted outfit. */
export const plannerGapsSchema = z.array(plannerGapSchema).max(6);

export const plannerOutputSchema = z
  .object({
    // Chosen ids, copied exactly from the fed set. The route re-validates every
    // id against that set — the model intermittently invents ids.
    itemIds: z.array(z.string().trim().min(1)).max(MAX_TRY_ON_GARMENTS),
    // Suggested occasion label — shared free-text vocabulary with the wardrobe.
    occasion: z.string().trim().min(1).max(60),
    // How the pick suits occasion + weather + palette; compromises live HERE.
    rationale: z.string().trim().min(1).max(320),
    gaps: plannerGapsSchema.default([]),
  })
  .refine((output) => output.itemIds.length > 0 || output.gaps.length > 0, {
    message: "An empty pick must be accompanied by at least one gap.",
    path: ["itemIds"],
  });

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
export type PlannerGap = z.infer<typeof plannerGapSchema>;

/** Coerce the `PlannedOutfit.gaps` JSON column back to typed gaps. Anything that
 *  doesn't validate reads as no gaps — a stored blob can never crash a read. */
export function parseStoredGaps(value: unknown): PlannerGap[] {
  if (value === null || value === undefined) return [];
  const parsed = plannerGapsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/**
 * Isolate the JSON object from a model reply. `generateText` is non-JSON-mode, so
 * a model reliably wraps its object in a ```json fence (and sometimes a line of
 * prose). Strip a leading/trailing fence, then fall back to the outermost `{…}`
 * span so surrounding text can't fail an otherwise-valid plan. Mirrors the Style
 * Book review route's `extractJson`.
 */
export function extractPlannerJson(text: string): string {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (unfenced.startsWith("{")) return unfenced;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  return start !== -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
}

/** Fence-strip → `JSON.parse` → `safeParse`. Returns null on any failure, so the
 *  route can treat "couldn't format" uniformly (retry, then a 502). */
export function parsePlannerOutput(text: string): PlannerOutput | null {
  try {
    const parsed = plannerOutputSchema.safeParse(
      JSON.parse(extractPlannerJson(text)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ReconciledIds = {
  /** Returned ids that belong to the fed set, in reply order, deduped, capped. */
  itemIds: string[];
  /** Returned ids NOT in the fed set — invented or foreign. Never persisted. */
  invalidIds: string[];
};

/**
 * Split the model's returned ids into those that belong to the fed set and those
 * that don't. The model intermittently invents ids, and a returned id could in
 * principle point at another user's item; only ids in `allowed` survive. Order is
 * the reply's, duplicates collapse to first occurrence, and the valid set is
 * capped at {@link MAX_TRY_ON_GARMENTS} to keep the outfit previewable even if the
 * model over-returns.
 */
export function reconcileItemIds(
  returned: readonly string[],
  allowed: Iterable<string>,
): ReconciledIds {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed);
  const itemIds: string[] = [];
  const invalidIds: string[] = [];
  const seen = new Set<string>();
  for (const id of returned) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (allowedSet.has(id)) {
      if (itemIds.length < MAX_TRY_ON_GARMENTS) itemIds.push(id);
    } else {
      invalidIds.push(id);
    }
  }
  return { itemIds, invalidIds };
}

/** The slot label used when the planner referenced pieces that aren't in the
 *  wardrobe and they had to be dropped — a single honest gap, never a phantom. */
export const DROPPED_ITEM_GAP_SLOT = "outfit";

/**
 * The gap appended when ids survive as invalid even after the one-shot retry: the
 * bad ids are dropped and this records the hole honestly, so the plan never shows
 * a phantom or foreign item. Kept within the schema's slot/note caps.
 */
export function droppedItemsGap(): PlannerGap {
  return {
    slot: DROPPED_ITEM_GAP_SLOT,
    note: "AURA referenced a piece that isn't in your wardrobe, so it was left out.",
  };
}

const dateFmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = dateFmtCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    dateFmtCache.set(key, formatter);
  }
  return formatter;
}

/**
 * A human-readable "when" for the prompt, in the event's own timezone (the
 * geocoded venue's, falling back to UTC). All-day events read as a bare date;
 * timed events add the start time and an optional end time. This is the only
 * temporal input the planner sees — never a raw instant it might misread.
 */
export function formatPlannerWhen(params: {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  timezone?: string | null;
}): string {
  const { startsAt, endsAt, allDay } = params;
  const timeZone = params.timezone && params.timezone.length > 0 ? params.timezone : "UTC";
  const dateLabel = fmt(timeZone, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(startsAt);
  if (allDay) return `${dateLabel} (all day)`;

  const timeFmt = fmt(timeZone, { hour: "numeric", minute: "2-digit" });
  const start = timeFmt.format(startsAt);
  if (endsAt) return `${dateLabel}, ${start}–${timeFmt.format(endsAt)}`;
  return `${dateLabel}, ${start}`;
}

/** A compact weather line for the prompt, or the degrade note when no forecast is
 *  available (beyond the horizon, unresolved place, or a provider outage). */
export function buildWeatherSummary(weather: PlannerWeatherInput | null): string {
  if (!weather) {
    return (
      "No forecast is available for this date yet. Plan on occasion, style, and " +
      "place, and note in the rationale that the weather wasn't available."
    );
  }
  const low = Math.round(weather.temperatureMin);
  const high = Math.round(weather.temperatureMax);
  const precip =
    typeof weather.precipitationProbabilityMax === "number"
      ? `, ${Math.round(weather.precipitationProbabilityMax)}% chance of precipitation`
      : "";
  return `${weather.label}, ${low}–${high}°C${precip}.`;
}

/**
 * The planner's system prompt. It fixes the weighting order and the hard rules,
 * and pins the exact JSON shape. "An honest gap beats a bad pick" and "choose
 * only from the given ids" are the load-bearing constraints the schema and the
 * route's id-reconciliation then enforce.
 */
export const PLANNER_INSTRUCTIONS = `
You are AURA, a precise personal stylist. Plan ONE complete, wearable outfit for a
single event using only the participant's own wardrobe items, which are given as a
JSON list. Each item has an "id" — you may only choose items by an id that appears
in that list. Never invent an id, never return an id that is not in the list.

Weigh your choices in this strict priority order:
  1. Occasion and formality — the outfit must be appropriate for the event first.
  2. Weather — suit the given forecast (layers, fabrics, rain/cold protection).
  3. Style preference — lean toward how the participant likes to dress, if given.
  4. Colour harmony — a coherent, flattering palette, last.

Build a complete outfit (a sensible top-to-bottom set, plus outer layer or shoes
when the occasion or weather calls for it), but never pad it with items that don't
belong. Choose at most ${MAX_TRY_ON_GARMENTS} items.

An honest gap beats a bad pick. If the wardrobe genuinely cannot cover a slot the
event needs (for example, no formal shoes for a formal event, or no warm layer for
cold weather), do NOT substitute something inappropriate — leave that slot out and
record it in "gaps". A gap means a real, actionable hole. Minor compromises (the
dressiest option available even if it is a little casual) belong in "rationale",
not in "gaps". If you can build no appropriate outfit at all, return an empty
"itemIds" together with at least one gap.

Return ONLY valid JSON. It must match this shape exactly:
{
  "itemIds": ["<id copied exactly from the wardrobe list>", ...],
  "occasion": "a short occasion label for this outfit",
  "rationale": "one natural sentence on how the pick suits the occasion, weather, and palette (and any compromise you made)",
  "gaps": [ { "slot": "e.g. formal shoes", "note": "what is missing and why it matters" } ]
}
The "gaps" array may be empty. Do not wrap the JSON in commentary.
`;

export type BuildPlannerPromptInput = {
  /** Owner-entered/defaulted occasion — NEVER the event title. */
  occasion: string;
  /** Human-readable event time, from {@link formatPlannerWhen}. */
  when: string;
  /** Resolved place label or raw place text; null when the event has no place. */
  place: string | null;
  /** Compact live-weather input for the event window, or null to degrade. */
  weather: PlannerWeatherInput | null;
  /** The owner's free-text style note; omitted from the prompt entirely when absent. */
  stylePreference: string | null;
  /** All active wardrobe items — the only ids the model may return. */
  wardrobe: readonly PlannerWardrobeItem[];
  /**
   * Item ids already committed to earlier events this week, when planning the
   * whole week in date order (spec §4). It is a **soft** repeat-avoidance nudge —
   * basics may repeat, distinctive pieces should not (the model judges which is
   * which). Empty or omitted for a standalone single-event plan, in which case no
   * repeat-avoidance line is added at all. The route feeds only ids that are in
   * this participant's wardrobe, so a foreign id can never reach the prompt.
   */
  priorItemIds?: readonly string[];
  /**
   * Ids the model must NOT reuse — a soft, prompt-level nudge for Regenerate/Swap
   * (spec §4). Regenerate feeds the whole current pick ("produce a different
   * outfit"); Swap feeds just the one piece being replaced. Soft: if excluding
   * them leaves no viable alternative, the model is told to return its best pick
   * with a rationale note rather than a fabricated gap. Omit for a fresh plan.
   */
  exclude?: readonly string[];
  /**
   * Ids to hold fixed in the outfit — Swap keeps every untouched piece so only the
   * targeted slot changes. Omit (or leave empty) for Regenerate and fresh plans.
   */
  keep?: readonly string[];
};

/** Render a comma-separated `id (name)` list for the adjustment directive, so the
 *  model can match ids by the readable name it also sees in the wardrobe list. */
function describeIds(
  ids: readonly string[],
  wardrobe: readonly PlannerWardrobeItem[],
): string {
  const nameById = new Map(wardrobe.map((item) => [item.id, item.name]));
  return ids
    .map((id) => {
      const name = nameById.get(id);
      return name ? `${id} (${name})` : id;
    })
    .join(", ");
}

/**
 * The soft exclusion/keep directive appended to a Regenerate or Swap prompt, or
 * `null` when there is nothing to adjust (a fresh plan). Exclusion is prompt-level
 * and soft by design (spec §4): it guarantees a different result in the normal
 * case, but when no alternative exists the model returns its best pick with a
 * rationale note — never a manufactured gap. `keep` (Swap) pins the untouched
 * pieces so only the swapped slot moves.
 */
export function buildAdjustmentDirective(input: {
  exclude?: readonly string[];
  keep?: readonly string[];
  wardrobe: readonly PlannerWardrobeItem[];
}): string | null {
  const exclude = (input.exclude ?? []).filter((id) => id.length > 0);
  const keep = (input.keep ?? []).filter((id) => id.length > 0);
  if (exclude.length === 0 && keep.length === 0) return null;

  const parts = ["Adjustment — the participant wants to change this outfit."];
  if (keep.length > 0) {
    parts.push(
      `Keep these already-chosen pieces (include their exact ids): ${describeIds(keep, input.wardrobe)}.`,
    );
  }
  if (exclude.length > 0) {
    const noun = exclude.length === 1 ? "this piece" : "these pieces";
    const want =
      keep.length > 0
        ? "a different piece to complete the outfit"
        : "a genuinely different outfit";
    parts.push(
      `Do NOT reuse ${noun}: ${describeIds(exclude, input.wardrobe)}. Choose ${want}.`,
      "If excluding leaves no good alternative, still return your best possible " +
        "outfit and explain the compromise in the rationale — do NOT invent a gap for this.",
    );
  }
  return parts.join(" ");
}

/**
 * Assemble the user prompt from the event's occasion, when, place, a weather
 * summary, an optional style block, and the wardrobe as a JSON list. There is no
 * `title` parameter by design — the privacy invariant is structural. The style
 * block is omitted entirely when absent (never an empty "Style preference:" line).
 */
export function buildPlannerPrompt(input: BuildPlannerPromptInput): string {
  const lines = [
    "Plan one outfit for this event from the wardrobe below.",
    "",
    `Occasion: ${input.occasion}`,
    `When: ${input.when}`,
    `Place: ${input.place ?? "Not specified"}`,
    `Weather: ${buildWeatherSummary(input.weather)}`,
  ];
  if (input.stylePreference && input.stylePreference.trim().length > 0) {
    lines.push(`Style preference: ${input.stylePreference.trim()}`);
  }
  if (input.priorItemIds && input.priorItemIds.length > 0) {
    lines.push(
      "",
      `Already worn earlier this week: ${JSON.stringify([...input.priorItemIds])}. ` +
        "Basics (plain tees, denim, a coat, everyday shoes) may repeat freely; " +
        "avoid re-using distinctive or statement pieces across the week — you " +
        "judge which is which.",
    );
  }
  lines.push(
    "",
    "Wardrobe — choose only from these items, by their exact id:",
    JSON.stringify(
      input.wardrobe.map((item) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        color: item.color,
        ...(item.brand ? { brand: item.brand } : {}),
        ...(item.occasion ? { occasion: item.occasion } : {}),
      })),
    ),
  );
  const adjustment = buildAdjustmentDirective({
    exclude: input.exclude,
    keep: input.keep,
    wardrobe: input.wardrobe,
  });
  if (adjustment) lines.push("", adjustment);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*                     Persisted planned-outfit DTO + serializer              */
/* -------------------------------------------------------------------------- */

/** A wardrobe item as it appears in a planned outfit's tiles. Only the opaque id
 *  plus display text crosses the wire — media is fetched per item via the
 *  short-lived wardrobe media endpoint, exactly as the gallery does. */
export type PlannedOutfitItemDto = {
  id: string;
  category: string;
  name: string;
  color: string;
  position: number | null;
};

/** A persisted planned outfit as the calendar renders it: item tiles, the AURA
 *  rationale, and honest gap chips. Shared by the plan route (its response) and
 *  the events list route (so a plan renders on reload). */
export type PlannedOutfitDto = {
  id: string;
  provenance: "ai_planned" | "user_edited";
  rationale: string | null;
  gaps: PlannerGap[];
  items: PlannedOutfitItemDto[];
  /** The cached on-demand try-on preview (#169), or null when none has been
   *  generated or the item set changed since. Drives "Generate preview" (null)
   *  vs "See preview" (present) in the UI. */
  previewImageUrl: string | null;
  /** When the outfit last changed, ISO 8601. Drives the storage-free re-plan
   *  nudge ({@link shouldSuggestReplan}) — no weather is persisted to derive it. */
  updatedAt: string;
};

/**
 * The Prisma `select` that produces a {@link PlannedOutfitRow} for
 * {@link serializePlannedOutfit}. Shared by every surface that returns a planned
 * outfit — the events list, the plan route, and the Regenerate/Swap route — so the
 * selected columns can't drift from what the serializer reads. A plain literal (no
 * Prisma import), spread into a `select` (or nested under an event's `outfit`).
 */
export const PLANNED_OUTFIT_SELECT = {
  id: true,
  provenance: true,
  rationale: true,
  gaps: true,
  previewImageUrl: true,
  updatedAt: true,
  items: {
    select: {
      position: true,
      wardrobeItem: { select: { id: true, category: true, name: true, color: true } },
    },
  },
} as const;

/** The shape a Prisma select must produce for {@link serializePlannedOutfit}. */
export type PlannedOutfitRow = {
  id: string;
  provenance: "ai_planned" | "user_edited";
  rationale: string | null;
  gaps: unknown;
  previewImageUrl: string | null;
  updatedAt: Date;
  items: {
    position: number | null;
    wardrobeItem: { id: string; category: string; name: string; color: string };
  }[];
};

/** Serialize a selected `PlannedOutfit` row to its DTO: items ordered by their
 *  optional `position` (then stably), gaps coerced from the JSON column. */
export function serializePlannedOutfit(row: PlannedOutfitRow): PlannedOutfitDto {
  const items = [...row.items]
    .sort((a, b) => {
      const ap = a.position ?? Number.MAX_SAFE_INTEGER;
      const bp = b.position ?? Number.MAX_SAFE_INTEGER;
      return ap - bp;
    })
    .map((item) => ({
      id: item.wardrobeItem.id,
      category: item.wardrobeItem.category,
      name: item.wardrobeItem.name,
      color: item.wardrobeItem.color,
      position: item.position,
    }));
  return {
    id: row.id,
    provenance: row.provenance,
    rationale: row.rationale,
    gaps: parseStoredGaps(row.gaps),
    items,
    previewImageUrl: row.previewImageUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*               "Plan my week" — sequential batch orchestration              */
/* -------------------------------------------------------------------------- */

/** The minimum an event must expose for the week-plan orchestrator: an id, a
 *  date-ordering key (ISO instant), and whether it is already planned. The
 *  calendar's `PlannedEventDto` satisfies this structurally. */
export type WeekPlanEvent = {
  id: string;
  startsAt: string;
  outfit: PlannedOutfitDto | null;
};

/** The result of planning one event in the week: the event and its new outfit,
 *  or a null outfit when that event failed (continue-on-error). */
export type WeekPlanOutcome<E extends WeekPlanEvent> = {
  event: E;
  outfit: PlannedOutfitDto | null;
};

/**
 * "Plan my week" (spec §3, §5): run the per-event planner **sequentially by
 * date** over **only the unplanned** events, feeding each call the item ids
 * already committed to earlier events this week so distinctive pieces don't
 * repeat while basics may. It is **non-destructive** — an event that already has
 * an outfit is skipped, never re-planned — and **continues on error**: one event
 * that fails (throws, or resolves to null) never aborts the rest of the week.
 *
 * The actual planner call is the injected {@link planOne} (the route call in the
 * app, a stub in tests), so this orchestration — the load-bearing date order,
 * prior-id accumulation, and continue-on-error — is pure and testable without a
 * model or a network. Each resolved event is handed to {@link onResolved} as it
 * lands, which is what drives the calendar's **progressive reveal**.
 *
 * `planOne` receives a **snapshot copy** of the committed ids, so a caller that
 * captures the argument sees exactly what was passed at call time.
 */
export async function planWeekSequentially<E extends WeekPlanEvent>(
  events: readonly E[],
  planOne: (event: E, priorItemIds: readonly string[]) => Promise<PlannedOutfitDto | null>,
  onResolved?: (outcome: WeekPlanOutcome<E>) => void,
): Promise<WeekPlanOutcome<E>[]> {
  const unplanned = events
    .filter((event) => event.outfit === null)
    .slice()
    .sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0));

  const committed: string[] = [];
  const outcomes: WeekPlanOutcome<E>[] = [];

  for (const event of unplanned) {
    let outfit: PlannedOutfitDto | null = null;
    try {
      outfit = await planOne(event, committed.slice());
    } catch {
      // Continue-on-error: a failing day is recorded as a null outcome and the
      // week carries on.
      outfit = null;
    }
    if (outfit) {
      for (const item of outfit.items) {
        if (!committed.includes(item.id)) committed.push(item.id);
      }
    }
    const outcome: WeekPlanOutcome<E> = { event, outfit };
    outcomes.push(outcome);
    onResolved?.(outcome);
  }

  return outcomes;
}

/* -------------------------------------------------------------------------- */
/*                    Storage-free "forecast now — re-plan?" nudge            */
/* -------------------------------------------------------------------------- */

/**
 * Whether to surface the "there's a forecast now — re-plan?" nudge for a placed
 * event's planned outfit (spec §5). It is **derived, never stored** — no weather
 * snapshot is persisted: the nudge fires exactly when the event is placed, sits
 * **within** the forecast horizon **now**, yet was planned **before** it entered
 * that window (so the plan is weather-less). `outfitUpdatedDate` is the outfit's
 * `updatedAt` as a civil date; a re-plan or user edit refreshes it and clears the
 * nudge. Past events (negative days-ahead) never nudge.
 */
export function shouldSuggestReplan(params: {
  placed: boolean;
  eventDate: CivilDate;
  outfitUpdatedDate: CivilDate;
  today: CivilDate;
  horizonDays?: number;
}): boolean {
  const { placed, eventDate, outfitUpdatedDate, today } = params;
  if (!placed) return false;
  const horizon = params.horizonDays ?? WEATHER_FORECAST_HORIZON_DAYS;

  const nowAhead = civilDaysBetween(today, eventDate);
  // Only within the live window (today .. horizon) is a forecast newly available.
  if (nowAhead < 0 || nowAhead > horizon) return false;

  // Was the outfit planned while the event was still beyond the horizon? If so it
  // was planned weather-less and is worth upgrading now.
  const plannedAhead = civilDaysBetween(outfitUpdatedDate, eventDate);
  return plannedAhead > horizon;
}
