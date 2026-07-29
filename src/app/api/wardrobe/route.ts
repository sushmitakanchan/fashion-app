import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import {
  exceedsActiveItemLimit,
  isOwnedWardrobeMediaId,
  wardrobeCapacityErrorBody,
} from "@/lib/wardrobe";
import {
  wardrobeItemCategorySchema,
  wardrobeSaveSchema,
} from "@/lib/validations";

/** List the authenticated participant's active wardrobe, optionally by category. */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedCategory = new URL(request.url).searchParams.get("category");
  const category = requestedCategory
    ? wardrobeItemCategorySchema.safeParse(requestedCategory)
    : null;
  if (category && !category.success) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  try {
    const items = await getPrisma().wardrobeItem.findMany({
      where: {
        user: { clerkId: userId },
        deletedAt: null,
        ...(category?.success ? { category: category.data } : {}),
      },
      select: {
        id: true,
        name: true,
        category: true,
        color: true,
        brand: true,
        normalizedMediaId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Wardrobe listing failed", error);
    return NextResponse.json(
      { error: "We couldn't load your wardrobe. Please try again." },
      { status: 500 },
    );
  }
}

const SAVE_FAILED = "We couldn't save your wardrobe. Please try again.";

// Thrown inside the save transaction so the capacity check and the insert are
// one atomic decision; caught just outside to become a 409.
class WardrobeCapacityError extends Error {
  constructor(readonly activeCount: number) {
    super("wardrobe-capacity");
  }
}

/**
 * Persist one reviewed import batch as durable Wardrobe Items. Only the owner-
 * confirmed attributes and the two private media references cross the wire; the
 * review step has already stripped failed and incomplete items. Every media id
 * is re-checked against the caller's own wardrobe folder, and the account's
 * active-item ceiling is re-enforced here as the write boundary.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A save only writes the database — the media was uploaded during import — so
  // unlike import it needs Cloudinary only later, at delivery.
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = wardrobeSaveSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { items } = parsed.data;

  // Trust nothing the client echoed back from import: both renditions of every
  // item must live under this caller's own wardrobe folder, or the whole batch
  // is refused. This is what stops a request from attaching a foreign or
  // arbitrary Cloudinary asset to a new Wardrobe Item.
  const foreignMedia = items.some(
    (item) =>
      !isOwnedWardrobeMediaId(item.originalMediaId, userId) ||
      !isOwnedWardrobeMediaId(item.normalizedMediaId, userId),
  );
  if (foreignMedia) {
    return NextResponse.json(
      { error: "Those images don't belong to your wardrobe." },
      { status: 403 },
    );
  }

  try {
    const prisma = getPrisma();

    // Provision the owning `User` row on first use. Nothing but AURA submission
    // creates one today, so a participant who imports before ever saving an AURA
    // profile would otherwise upload media and then hit a dead end. Mirror the
    // minimum from Clerk, and only require an email when actually creating.
    let user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true },
    });
    if (!user) {
      const clerkUser = await currentUser();
      const email = clerkUser?.primaryEmailAddress?.emailAddress;
      if (!email) {
        console.error("Wardrobe save can't provision a user without an email", userId);
        return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
      }
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email,
          name: clerkUser?.fullName ?? null,
          imageUrl: clerkUser?.imageUrl ?? null,
        },
        select: { id: true },
      });
    }
    const ownerId = user.id;

    // The active-item ceiling is the authoritative write boundary, so the count
    // and the insert run in one transaction: two concurrent batch saves can't
    // both read "199" and jointly overshoot. `brand` collapses to null when
    // absent — a missing brand never blocks a save.
    const created = await prisma.$transaction(async (tx) => {
      const activeCount = await tx.wardrobeItem.count({
        where: { userId: ownerId, deletedAt: null },
      });
      if (exceedsActiveItemLimit(activeCount, items.length)) {
        throw new WardrobeCapacityError(activeCount);
      }
      return tx.wardrobeItem.createManyAndReturn({
        data: items.map((item) => ({
          userId: ownerId,
          category: item.category,
          name: item.name,
          color: item.color,
          brand: item.brand ?? null,
          originalMediaId: item.originalMediaId,
          originalMediaFormat: item.originalMediaFormat,
          normalizedMediaId: item.normalizedMediaId,
          normalizedMediaFormat: item.normalizedMediaFormat,
        })),
        select: {
          id: true,
          name: true,
          category: true,
          color: true,
          brand: true,
          normalizedMediaId: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({ items: created }, { status: 201 });
  } catch (error) {
    if (error instanceof WardrobeCapacityError) {
      return NextResponse.json(wardrobeCapacityErrorBody(error.activeCount), {
        status: 409,
      });
    }
    console.error("Wardrobe save failed", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }
}
