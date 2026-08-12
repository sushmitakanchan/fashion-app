import { NextResponse } from "next/server";

import { AiProviderConfigError, generateText } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";
import { geocodePlace } from "@/lib/geocoding";
import { fetchDayWeather, WEATHER_FORECAST_HORIZON_DAYS } from "@/lib/weather";
import { civilDateInTimeZone, civilToUtcNoon } from "@/lib/calendar-week";
import {
  buildPlannerPrompt,
  droppedItemsGap,
  formatPlannerWhen,
  parsePlannerOutput,
  PLANNER_INSTRUCTIONS,
  reconcileItemIds,
  type PlannerGap,
  type PlannerOutput,
  type PlannerWardrobeItem,
  type PlannerWeatherInput,
} from "@/lib/aura-outfit-planner";
import { DEFAULT_PLANNED_OCCASION } from "@/lib/validations";

/**
 * Server-side orchestration shared by the two planner egress routes — the initial
 * per-event "Plan this outfit" (#176) and the inline Regenerate/Swap (#178). Both
 * resolve the same live weather, then run the same strict generate → parse →
 * reconcile → one-shot-retry → drop-and-gap-flag loop; only the prompt (a plain
 * plan vs. one carrying a soft exclude/keep directive) and the persistence (create
 * vs. update) differ. Keeping the id-discipline loop in one place means the retry
 * wording and the "empty pick is legal only beside a gap" invariant can never
 * drift between the two surfaces.
 *
 * The event **title never reaches here** — the routes never select it, exactly as
 * the pure prompt builder has no title parameter.
 */

type Failure = { code: string; error: string; retryable: boolean };

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole civil days from `today` to `date` (both YYYY-MM-DD), via UTC-noon anchors
 *  so a DST transition near midnight can't skew the count. */
function daysBetween(today: string, date: string): number {
  return Math.round(
    (civilToUtcNoon(date).getTime() - civilToUtcNoon(today).getTime()) / DAY_MS,
  );
}

/** The event fields the planner reads. `title` is deliberately absent — it must
 *  never reach an outbound payload, and leaving it off the type makes that
 *  structural. */
export type PlannerEvent = {
  id: string;
  userId: string;
  occasion: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  placeText: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

/**
 * Resolve the compact weather input for the event window, degrading to `null`
 * whenever a forecast isn't available — no place, an unresolvable place, beyond
 * the forecast horizon, or a provider outage. Egress here (geocoding + forecast)
 * is already authorized by the consent gate in the caller. Coordinates are cached
 * on the event (weather itself is never persisted); a cache-write failure is
 * non-fatal. Returns the place label actually used, so a coarsened match is named.
 */
export async function resolvePlannerWeather(
  prisma: ReturnType<typeof getPrisma>,
  event: PlannerEvent,
): Promise<{ weather: PlannerWeatherInput | null; placeLabel: string | null }> {
  if (!event.placeText) return { weather: null, placeLabel: null };

  let { latitude, longitude, timezone, placeLabel } = event;

  if (latitude === null || longitude === null) {
    let outcome;
    try {
      outcome = await geocodePlace(event.placeText);
    } catch {
      return { weather: null, placeLabel: null };
    }
    if (outcome.status === "unresolved") return { weather: null, placeLabel: null };

    latitude = outcome.place.latitude;
    longitude = outcome.place.longitude;
    timezone = outcome.place.timezone;
    placeLabel = outcome.place.placeLabel;

    try {
      await prisma.plannedEvent.update({
        where: { id: event.id },
        data: { latitude, longitude, timezone, placeLabel },
      });
    } catch (error) {
      console.error("Caching geocoded coordinates failed", error);
    }
  }

  const tz = timezone && timezone.length > 0 ? timezone : "UTC";
  const eventDate = event.allDay
    ? civilDateInTimeZone(event.startsAt, "UTC")
    : civilDateInTimeZone(event.startsAt, tz);
  const today = civilDateInTimeZone(new Date(), tz);
  const daysAhead = daysBetween(today, eventDate);

  if (daysAhead < 0 || daysAhead > WEATHER_FORECAST_HORIZON_DAYS) {
    return { weather: null, placeLabel };
  }

  const result = await fetchDayWeather({ latitude, longitude, timezone: tz, date: eventDate });
  if (result.status !== "ok") return { weather: null, placeLabel };

  return {
    weather: {
      label: result.weather.description.label,
      temperatureMax: result.weather.temperatureMax,
      temperatureMin: result.weather.temperatureMin,
      precipitationProbabilityMax: result.weather.precipitationProbabilityMax,
    },
    placeLabel,
  };
}

type PlannerCallResult =
  | { ok: true; output: PlannerOutput | null }
  | { ok: false; response: NextResponse };

/**
 * One planner exchange: generate, then fence-strip → parse → safeParse (null on
 * any format failure). A provider misconfiguration becomes a 503 and any other
 * generation error a 502 — the same failure vocabulary the review route uses —
 * returned as a ready response so the caller can short-circuit. Shared by the
 * first attempt and the one-shot retry so that vocabulary can't drift between them.
 */
async function callPlanner(prompt: string): Promise<PlannerCallResult> {
  try {
    const { text } = await generateText({ instructions: PLANNER_INSTRUCTIONS, prompt });
    return { ok: true, output: parsePlannerOutput(text) };
  } catch (error) {
    if (error instanceof AiProviderConfigError) {
      return {
        ok: false,
        response: failure(503, {
          code: "ai-unavailable",
          error: "AURA planning is unavailable right now.",
          retryable: true,
        }),
      };
    }
    console.error("Planner generation failed", error);
    return {
      ok: false,
      response: failure(502, {
        code: "plan-failed",
        error: "AURA couldn't plan this outfit. Please try again.",
        retryable: true,
      }),
    };
  }
}

export type PlannerRunResult =
  | { ok: true; itemIds: string[]; gaps: PlannerGap[]; output: PlannerOutput }
  | { ok: false; response: NextResponse };

/**
 * Run the planner against an already-built prompt and reconcile the reply: every
 * returned id is validated against `allowedIds`; a miss (or an unparseable reply)
 * triggers one retry that re-states the exact allowed ids — the guard against both
 * a malformed reply and an id pointing at another user's item. Any id still invalid
 * after the retry is dropped and gap-flagged (never a phantom or foreign item).
 *
 * The returned `itemIds`/`gaps` preserve the invariant that an empty pick is legal
 * only beside a gap; a run that can't satisfy it resolves to a ready 502 response.
 */
export async function runPlanner(
  prompt: string,
  allowedIds: Set<string>,
): Promise<PlannerRunResult> {
  const first = await callPlanner(prompt);
  if (!first.ok) return first;
  let output = first.output;
  let reconciled = output ? reconcileItemIds(output.itemIds, allowedIds) : null;

  // One-shot retry when the reply couldn't be parsed OR referenced invented ids.
  if (!output || (reconciled && reconciled.invalidIds.length > 0)) {
    const retryPrompt =
      `${prompt}\n\nYour previous reply was not usable: it either wasn't valid JSON or ` +
      `it referenced ids that are not in the wardrobe. Choose ONLY from these exact ids: ` +
      `${JSON.stringify([...allowedIds])}. Return the same JSON shape and nothing else.`;
    const retry = await callPlanner(retryPrompt);
    if (!retry.ok) return retry;
    output = retry.output;
    reconciled = output ? reconcileItemIds(output.itemIds, allowedIds) : null;
  }

  if (!output || !reconciled) {
    console.error("Planner returned an invalid response after retry");
    return {
      ok: false,
      response: failure(502, {
        code: "invalid-plan-response",
        error: "AURA couldn't format this plan. Please try again.",
        retryable: true,
      }),
    };
  }

  // Drop any still-invalid ids and gap-flag the hole — never persist a phantom.
  const gaps: PlannerGap[] = [...output.gaps];
  if (reconciled.invalidIds.length > 0) gaps.push(droppedItemsGap());
  const itemIds = reconciled.itemIds;

  // Invariant (spec §3): an empty pick is legal only beside a gap. Reconciliation
  // preserves it — an all-invalid reply drops to empty but gains the dropped gap —
  // but re-check so a bug here can never surface a silent empty outfit.
  if (itemIds.length === 0 && gaps.length === 0) {
    return {
      ok: false,
      response: failure(502, {
        code: "invalid-plan-response",
        error: "AURA couldn't format this plan. Please try again.",
        retryable: true,
      }),
    };
  }

  return { ok: true, itemIds, gaps, output };
}

/**
 * The full per-event planning step shared by "Plan this outfit" and Regenerate/Swap
 * once the caller has authorized egress: load the active wardrobe (the only ids the
 * model may return), resolve the live weather, build the prompt — carrying the soft
 * `exclude`/`keep` directive for an inline edit — and run the id-discipline loop.
 * Returns the reconciled pick (or a ready error response for an empty wardrobe, a
 * wardrobe-read failure, or an unusable reply). The caller owns only how the result
 * is persisted (create vs. update), and the event `title` is never read here.
 */
export async function buildPlannedOutfit(params: {
  prisma: ReturnType<typeof getPrisma>;
  event: PlannerEvent;
  stylePreference: string | null;
  exclude?: readonly string[];
  keep?: readonly string[];
}): Promise<PlannerRunResult> {
  const { prisma, event } = params;

  // The wardrobe feed: all active items as text (no media, no pre-filter). This is
  // the ONLY set of ids the model may return.
  let wardrobe: PlannerWardrobeItem[];
  try {
    wardrobe = await prisma.wardrobeItem.findMany({
      where: { userId: event.userId, deletedAt: null },
      select: { id: true, category: true, name: true, color: true, brand: true, occasion: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("Planner wardrobe lookup failed", error);
    return {
      ok: false,
      response: failure(500, {
        code: "plan-wardrobe-failed",
        error: "We couldn't read your wardrobe. Please try again.",
        retryable: true,
      }),
    };
  }

  // Nothing to choose from: don't contact the AI. Tell the participant to add items
  // rather than persisting an empty outfit.
  if (wardrobe.length === 0) {
    return {
      ok: false,
      response: failure(422, {
        code: "empty-wardrobe",
        error: "Add some wardrobe items first, then AURA can plan an outfit.",
        retryable: false,
      }),
    };
  }

  const { weather } = await resolvePlannerWeather(prisma, event);

  const prompt = buildPlannerPrompt({
    occasion: event.occasion ?? DEFAULT_PLANNED_OCCASION,
    when: formatPlannerWhen({
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      timezone: event.timezone,
    }),
    place: event.placeLabel ?? event.placeText,
    weather,
    stylePreference: params.stylePreference,
    wardrobe,
    exclude: params.exclude,
    keep: params.keep,
  });

  return runPlanner(prompt, new Set(wardrobe.map((item) => item.id)));
}
