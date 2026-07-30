import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ itemId: string }> };

const itemSelect = {
  id: true,
  category: true,
  name: true,
  color: true,
  brand: true,
  deletedAt: true,
  recoveryExpiresAt: true,
} as const;

/** Restore the owner's item only while its recoverable-deletion window is live. */
export async function POST(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  try {
    const deletedItem = await getPrisma().wardrobeItem.findFirst({
      where: { id: itemId, user: { clerkId: userId }, deletedAt: { not: null } },
      select: { id: true, recoveryExpiresAt: true },
    });
    if (!deletedItem) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!deletedItem.recoveryExpiresAt || deletedItem.recoveryExpiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This item's recovery window has expired." },
        { status: 410 },
      );
    }

    const item = await getPrisma().wardrobeItem.update({
      where: { id: deletedItem.id },
      data: { deletedAt: null, recoveryExpiresAt: null },
      select: itemSelect,
    });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Wardrobe item restoration failed", error);
    return NextResponse.json(
      { error: "We couldn't restore that item. Please try again." },
      { status: 500 },
    );
  }
}
