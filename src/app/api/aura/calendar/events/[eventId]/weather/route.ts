import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { isPlanningEgressAllowed } from "@/lib/planning-consent";
import { PLANNING_POLICY_VERSION } from "@/lib/planning-policy";
import { geocodePlace } from "@/lib/geocoding";
import {
  fetchDayWeather,
  WEATHER_FORECAST_HORIZON_DAYS,
  type DayWeather,
  type WeatherStatus,
} from "@/lib/weather";
import { civilDateInTimeZone, civilToUtcNoon } from "@/lib/calendar-week";
import { planningEgressSchema } from "@/lib/validations";

/**
 * Live weather for one placed event — the calendar's first outside contact, and
 * the whole reason the Smart Planning consent boundary exists. The flow is:
 * resolve the place through Open-Meteo geocoding (caching the coordinates on the
 * event), then fetch the day's forecast (never persisted). Both steps sit behind
 * the boundary gate: egress is refused unless consent is active, current, and the
 * client echoes the policy version it disclosed.
 *
 * The event **title never egresses**. It isn't even selected below — the geocoder
 * takes only `placeText` and the weather fetch only coordinates, so there is no
 * path by which a title could reach a third party.
 *
 * Weather is transient by design (spec §2/§8): the coordinates/timezone/label are
 * cached on the event, but the forecast is a live read the client caches briefly.
 */

type RouteContext = { params: Promise<{ eventId: string }> };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole civil days from `today` to `date` (both YYYY-MM-DD), via UTC-noon
 *  anchors so a DST transition near midnight can't skew the count. */
function daysBetween(today: string, date: string): number {
  return Math.round(
    (civilToUtcNoon(date).getTime() - civilToUtcNoon(today).getTime()) / DAY_MS,
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reading the event and caching its coordinates both need the database; the
  // geocoding/weather providers are keyless, so there is no other config gate.
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const { eventId } = await params;

  const parsed = planningEgressSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Owner-scoped load. `title` is deliberately NOT selected — it must never
  // reach an outbound payload, and not selecting it makes that structural.
  let event;
  try {
    event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: {
        id: true,
        startsAt: true,
        allDay: true,
        placeText: true,
        placeLabel: true,
        latitude: true,
        longitude: true,
        timezone: true,
        user: {
          select: {
            planningConsent: {
              select: { policyVersion: true, withdrawnAt: true },
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Weather event lookup failed", error);
    return NextResponse.json(
      { error: "We couldn't load that event. Please try again." },
      { status: 500 },
    );
  }
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Unplaced event: nothing to geocode, so no outside contact happens at all —
  // and no consent is needed to say so.
  if (!event.placeText) {
    return NextResponse.json({ placed: false });
  }

  // The boundary gate, re-checked immediately before any egress. A stale echoed
  // version is refused even if a consent row exists.
  const allowed = isPlanningEgressAllowed(
    event.user.planningConsent,
    parsed.data.policyVersion,
    PLANNING_POLICY_VERSION,
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error: "Smart Planning consent is required.",
        code: "consent-required",
        currentPolicyVersion: PLANNING_POLICY_VERSION,
      },
      { status: 403 },
    );
  }

  // ---- Egress is authorized from here. ----

  // Resolve the place if it isn't cached yet. Coordinates are cached on the
  // event; a coarsened (approximate) resolution still caches, so the calendar
  // says "using <city>" once, not on every open.
  let latitude = event.latitude;
  let longitude = event.longitude;
  let timezone = event.timezone;
  let placeLabel = event.placeLabel;
  let approximate = false;

  if (latitude === null || longitude === null) {
    let outcome;
    try {
      outcome = await geocodePlace(event.placeText);
    } catch (error) {
      console.error("Geocoding failed", error);
      return NextResponse.json(
        { placed: true, unresolved: false, place: null, weather: null, weatherStatus: "unavailable" },
        { status: 200 },
      );
    }

    if (outcome.status === "unresolved") {
      // Honest miss: no coordinates stored, no weather, no guess. There is no
      // forecast because there is no place — `unavailable`, not a horizon issue.
      return NextResponse.json({
        placed: true,
        unresolved: true,
        place: null,
        weather: null,
        weatherStatus: "unavailable" satisfies WeatherStatus,
        policyVersion: PLANNING_POLICY_VERSION,
      });
    }

    latitude = outcome.place.latitude;
    longitude = outcome.place.longitude;
    timezone = outcome.place.timezone;
    placeLabel = outcome.place.placeLabel;
    approximate = outcome.approximate;

    try {
      await prisma.plannedEvent.update({
        where: { id: event.id },
        data: { latitude, longitude, timezone, placeLabel },
      });
    } catch (error) {
      // Non-fatal: the cache write failing doesn't stop us returning live
      // weather this once; the next open simply re-geocodes.
      console.error("Caching geocoded coordinates failed", error);
    }
  }

  // The event's day at the venue. All-day events are date-only (stored at UTC
  // midnight); timed events bucket by the place's timezone.
  const tz = timezone && timezone.length > 0 ? timezone : "UTC";
  const eventDate = event.allDay
    ? civilDateInTimeZone(event.startsAt, "UTC")
    : civilDateInTimeZone(event.startsAt, tz);
  const today = civilDateInTimeZone(new Date(), tz);
  const daysAhead = daysBetween(today, eventDate);

  // Only fetch inside the forecast horizon. A past or far-future event has no
  // live forecast — the calendar shows the plan without weather.
  let weather: DayWeather | null = null;
  let weatherStatus: WeatherStatus = "beyond-horizon";
  if (daysAhead >= 0 && daysAhead <= WEATHER_FORECAST_HORIZON_DAYS) {
    const result = await fetchDayWeather({
      latitude,
      longitude,
      timezone: tz,
      date: eventDate,
    });
    if (result.status === "ok") {
      weather = result.weather;
      weatherStatus = "ok";
    } else {
      weatherStatus = result.status;
    }
  }

  return NextResponse.json({
    placed: true,
    unresolved: false,
    approximate,
    place: { latitude, longitude, timezone: tz, placeLabel },
    weather,
    weatherStatus,
    policyVersion: PLANNING_POLICY_VERSION,
  });
}
