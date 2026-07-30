import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

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
import { getOrProvisionUserId } from "@/lib/wardrobe-user";
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
        occasion: true,
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

    // Provision the owning `User` row on first use — a participant can import and
    // save before ever creating an AURA profile, which is the only other thing
    // that mints a user today. Returns null only when a new user can't be created
    // (Clerk exposes no email), which is not a reachable save path in practice.
    const ownerId = await getOrProvisionUserId(prisma, userId);
    if (!ownerId) {
      console.error("Wardrobe save can't provision a user for", userId);
      return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
    }

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
          occasion: item.occasion ?? null,
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
