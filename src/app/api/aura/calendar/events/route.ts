import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { getOrProvisionUserId } from "@/lib/wardrobe-user";
import { eventSelect, serializeEvent } from "@/lib/planned-event";
import {
  DEFAULT_PLANNED_OCCASION,
  plannedEventCreateSchema,
} from "@/lib/validations";

/**
 * List the authenticated participant's planned events whose start falls in the
 * `[from, to)` instant window. The agenda view over-fetches a padded range and
 * buckets precisely on the client, so this only has to bound and order the rows.
 * Pure read — no AI, no external calls.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const from = new Date(params.get("from") ?? "");
  const to = new Date(params.get("to") ?? "");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return NextResponse.json(
      { error: "A valid `from` and `to` instant range is required." },
      { status: 400 },
    );
  }

  try {
    const events = await getPrisma().plannedEvent.findMany({
      where: {
        user: { clerkId: userId },
        startsAt: { gte: from, lt: to },
      },
      select: eventSelect,
      orderBy: { startsAt: "asc" },
    });

    return NextResponse.json({ events: events.map(serializeEvent) });
  } catch (error) {
    console.error("Calendar events listing failed", error);
    return NextResponse.json(
      { error: "We couldn't load your calendar. Please try again." },
      { status: 500 },
    );
  }
}

const SAVE_FAILED = "We couldn't add your event. Please try again.";

/**
 * Add one manual planned event. This is the always-works base of the calendar:
 * a pure write with no outside contact. The place is stored exactly as typed —
 * geocoding, weather, and AI planning are separate, consent-gated steps — so the
 * geocoded columns stay null and `occasion` is owner-entered, defaulted here to a
 * generic occasion when left blank (never inferred from the title).
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = plannedEventCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { title, occasion, allDay, startsAt, endsAt, placeText } = parsed.data;

  try {
    const prisma = getPrisma();

    // Provision the owning `User` row on first use — a participant may reach the
    // calendar before ever saving an AURA profile (the page's portrait gate makes
    // that unlikely, but the write boundary must not assume it).
    const ownerId = await getOrProvisionUserId(prisma, userId);
    if (!ownerId) {
      console.error("Calendar event save can't provision a user for", userId);
      return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
    }

    const event = await prisma.plannedEvent.create({
      data: {
        userId: ownerId,
        title,
        occasion: occasion ?? DEFAULT_PLANNED_OCCASION,
        allDay,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        placeText: placeText ?? null,
        source: "manual",
      },
      select: eventSelect,
    });

    return NextResponse.json({ event: serializeEvent(event) }, { status: 201 });
  } catch (error) {
    console.error("Calendar event save failed", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }
}
