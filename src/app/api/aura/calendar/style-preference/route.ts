import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import { getOrProvisionUserId } from "@/lib/wardrobe-user";
import { stylePreferenceSchema } from "@/lib/validations";

/**
 * The participant's free-text style preference (read / upsert). One row per user,
 * replaced on each edit. This is plain owner-entered content — NOT a consent
 * record and NOT an egress: nothing here contacts a third party, so it needs no
 * Smart Planning gate. The planner reads the stored text later (governed by
 * `PlanningConsent` at that boundary); this route only captures and persists it.
 *
 * "Absent" is a first-class state. A participant who has never written one, or
 * who clears theirs, has no row — which is exactly what the planner omits (no
 * hollow "no preferences" line). So an empty `text` is a clear, not a stored "".
 */

const PREFERENCE_SAVE_FAILED =
  "We couldn't save your style preference. Please try again.";
const PREFERENCE_LOAD_FAILED =
  "We couldn't load your style preference. Please try again.";

/** Report the caller's stored style preference, or `null` when absent. */
export async function GET() {
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

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    const preference = user
      ? await prisma.stylePreference.findUnique({
          where: { userId: user.id },
          select: { text: true },
        })
      : null;
    return NextResponse.json({ text: preference?.text ?? null });
  } catch (error) {
    console.error("Style preference lookup failed", error);
    return NextResponse.json({ error: PREFERENCE_LOAD_FAILED }, { status: 500 });
  }
}

/**
 * Write or replace the caller's style preference. Idempotent upsert on the
 * one-row-per-user constraint, so an edit replaces in place rather than
 * accumulating rows. A blank `text` clears the preference — the row is removed
 * so the caller returns to the absent state the planner omits — rather than
 * persisting an empty string that would read as a signal.
 */
export async function PUT(request: Request) {
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

  const parsed = stylePreferenceSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { text } = parsed.data;

  try {
    const prisma = getPrisma();
    const ownerId = await getOrProvisionUserId(prisma, userId);
    if (!ownerId) {
      console.error("Style preference save can't provision a user for", userId);
      return NextResponse.json({ error: PREFERENCE_SAVE_FAILED }, { status: 500 });
    }

    if (text.length === 0) {
      // Clear-to-absent. `deleteMany` is a no-op when nothing exists, so a clear
      // is idempotent without a prior existence check.
      await prisma.stylePreference.deleteMany({ where: { userId: ownerId } });
      return NextResponse.json({ text: null });
    }

    const preference = await prisma.stylePreference.upsert({
      where: { userId: ownerId },
      create: { userId: ownerId, text },
      update: { text },
      select: { text: true },
    });
    return NextResponse.json({ text: preference.text });
  } catch (error) {
    console.error("Style preference save failed", error);
    return NextResponse.json({ error: PREFERENCE_SAVE_FAILED }, { status: 500 });
  }
}
