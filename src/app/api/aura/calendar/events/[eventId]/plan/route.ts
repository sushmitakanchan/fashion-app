import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { AiProviderConfigError, generateText } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";
import { isPlanningEgressAllowed } from "@/lib/planning-consent";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { geocodePlace } from "@/lib/geocoding";
import {
  fetchDayWeather,
  WEATHER_FORECAST_HORIZON_DAYS,
} from "@/lib/weather";
import { civilDateInTimeZone, civilToUtcNoon } from "@/lib/calendar-week";
import {
  buildPlannerPrompt,
  droppedItemsGap,
  formatPlannerWhen,
  parsePlannerOutput,
  PLANNER_INSTRUCTIONS,
  reconcileItemIds,
  serializePlannedOutfit,
  type PlannerGap,
  type PlannerOutput,
  type PlannerWardrobeItem,
  type PlannerWeatherInput,
} from "@/lib/aura-outfit-planner";
import { DEFAULT_PLANNED_OCCASION, plannerPlanSchema } from "@/lib/validations";

/**
 * Plan ONE event's outfit from the wardrobe with a single AI call (spec §3–§5,
 * ticket #176). It mirrors the Style Book review route's discipline — strict
 * prompt + Zod + fence-strip → parse → safeParse, non-streaming — and sits behind
 * the same Smart Planning consent boundary as live weather.
 *
 * The event **title never egresses** and is never even selected below: the planner
 * works from occasion, when, place, weather, style, and the wardrobe list only.
 *
 * The model intermittently invents ids, so every returned id is validated against
 * the fed set; a miss triggers one retry with the exact allowed-id list, and any
 * id still invalid after that is dropped and gap-flagged — never a phantom or a
 * foreign item. Beyond the ~7-day weather horizon (or when the place can't be
 * located) the plan degrades to occasion + style + place with a note.
 */

type RouteContext = { params: Promise<{ eventId: string }> };

type Failure = { code: string; error: string; retryable: boolean };

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole civil days from `today` to `date` (both YYYY-MM-DD), via UTC-noon
 *  anchors so a DST transition near midnight can't skew the count. */
function daysBetween(today: string, date: string): number {
  return Math.round(
    (civilToUtcNoon(date).getTime() - civilToUtcNoon(today).getTime()) / DAY_MS,
  );
}

type PlannerEvent = {
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
 * is already authorized by the consent gate in the handler. Coordinates are cached
 * on the event (weather itself is never persisted); a cache-write failure is
 * non-fatal. Returns the place label actually used, so a coarsened match is named.
 */
async function resolvePlannerWeather(
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

const outfitSelect = {
  id: true,
  provenance: true,
  rationale: true,
  gaps: true,
  updatedAt: true,
  items: {
    select: {
      position: true,
      wardrobeItem: { select: { id: true, category: true, name: true, color: true } },
    },
  },
} as const;

export async function POST(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, { code: "unauthorized", error: "Unauthorized", retryable: false });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE, code: "not-configured", retryable: true },
      { status: 503 },
    );
  }

  const { eventId } = await params;

  const parsed = plannerPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Owner-scoped load. `title` is deliberately NOT selected — it must never reach
  // an outbound payload, and not selecting it makes that structural.
  let event;
  try {
    event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: {
        id: true,
        userId: true,
        occasion: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        placeText: true,
        placeLabel: true,
        latitude: true,
        longitude: true,
        timezone: true,
        outfit: { select: { id: true } },
        user: {
          select: {
            planningConsent: { select: { policyVersion: true, withdrawnAt: true } },
            stylePreference: { select: { text: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error("Planner event lookup failed", error);
    return failure(500, {
      code: "plan-lookup-failed",
      error: "We couldn't open that event. Please try again.",
      retryable: true,
    });
  }
  if (!event) {
    return failure(404, { code: "event-not-found", error: "Not found", retryable: false });
  }

  // Non-destructive: "Plan this outfit" only fills an unplanned event. Regenerate
  // (a later ticket) is what replaces an existing pick.
  if (event.outfit) {
    return failure(409, {
      code: "already-planned",
      error: "This event already has an outfit.",
      retryable: false,
    });
  }

  // The boundary gate, re-checked immediately before any egress (geocoding,
  // weather, and the AI call all sit behind it).
  if (
    !isPlanningEgressAllowed(
      event.user.planningConsent,
      parsed.data.policyVersion,
      PLANNING_POLICY_VERSION,
    )
  ) {
    return NextResponse.json(
      {
        error: "Smart Planning consent is required.",
        code: "consent-required",
        currentPolicyVersion: PLANNING_POLICY_VERSION,
        retryable: false,
      },
      { status: 403 },
    );
  }

  // ---- Egress is authorized from here. ----

  // The wardrobe feed: all active items as text (no media, no pre-filter). This
  // is the ONLY set of ids the model may return.
  let wardrobe: PlannerWardrobeItem[];
  try {
    wardrobe = await prisma.wardrobeItem.findMany({
      where: { userId: event.userId, deletedAt: null },
      select: { id: true, category: true, name: true, color: true, brand: true, occasion: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("Planner wardrobe lookup failed", error);
    return failure(500, {
      code: "plan-wardrobe-failed",
      error: "We couldn't read your wardrobe. Please try again.",
      retryable: true,
    });
  }

  // Nothing to choose from: don't contact the AI. Tell the participant to add
  // items rather than persisting an empty outfit.
  if (wardrobe.length === 0) {
    return failure(422, {
      code: "empty-wardrobe",
      error: "Add some wardrobe items first, then AURA can plan an outfit.",
      retryable: false,
    });
  }

  const { weather } = await resolvePlannerWeather(prisma, event as PlannerEvent);

  const allowedIds = new Set(wardrobe.map((item) => item.id));

  // Repeat-avoidance context for "Plan my week" (spec §4): the ids already
  // committed to earlier events this week. Intersect with the fed wardrobe so a
  // client-supplied id can only ever reference this participant's own items —
  // the prompt never sees a foreign or invented id.
  const priorItemIds = (parsed.data.priorItemIds ?? []).filter((id) =>
    allowedIds.has(id),
  );

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
    stylePreference: event.user.stylePreference?.text ?? null,
    wardrobe,
    priorItemIds,
  });

  // First attempt.
  const first = await callPlanner(prompt);
  if (!first.ok) return first.response;
  let output = first.output;
  let reconciled = output ? reconcileItemIds(output.itemIds, allowedIds) : null;

  // One-shot retry when the reply couldn't be parsed OR referenced invented ids.
  // The retry re-states the exact allowed ids — the guard against both a malformed
  // reply and an id pointing at another user's item.
  if (!output || (reconciled && reconciled.invalidIds.length > 0)) {
    const retryPrompt =
      `${prompt}\n\nYour previous reply was not usable: it either wasn't valid JSON or ` +
      `it referenced ids that are not in the wardrobe. Choose ONLY from these exact ids: ` +
      `${JSON.stringify([...allowedIds])}. Return the same JSON shape and nothing else.`;
    const retry = await callPlanner(retryPrompt);
    if (!retry.ok) return retry.response;
    output = retry.output;
    reconciled = output ? reconcileItemIds(output.itemIds, allowedIds) : null;
  }

  if (!output || !reconciled) {
    console.error("Planner returned an invalid response after retry");
    return failure(502, {
      code: "invalid-plan-response",
      error: "AURA couldn't format this plan. Please try again.",
      retryable: true,
    });
  }

  // Drop any still-invalid ids and gap-flag the hole — never persist a phantom.
  const gaps: PlannerGap[] = [...output.gaps];
  if (reconciled.invalidIds.length > 0) gaps.push(droppedItemsGap());

  const itemIds = reconciled.itemIds;

  // Invariant (spec §3): an empty pick is legal only beside a gap. Reconciliation
  // preserves it — an all-invalid reply drops to empty but gains the dropped gap —
  // but re-check so a bug here can never persist a silent empty outfit.
  if (itemIds.length === 0 && gaps.length === 0) {
    return failure(502, {
      code: "invalid-plan-response",
      error: "AURA couldn't format this plan. Please try again.",
      retryable: true,
    });
  }

  let outfit;
  try {
    outfit = await prisma.plannedOutfit.create({
      data: {
        eventId: event.id,
        userId: event.userId,
        provenance: "ai_planned",
        rationale: output.rationale,
        gaps,
        items: {
          create: itemIds.map((wardrobeItemId, index) => ({
            wardrobeItemId,
            position: index,
          })),
        },
      },
      select: outfitSelect,
    });
  } catch (error) {
    console.error("Planner outfit persistence failed", error);
    return failure(500, {
      code: "plan-save-failed",
      error: "AURA planned this outfit, but we couldn't save it. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ outfit: serializePlannedOutfit(outfit) }, { status: 201 });
}
