import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";
import { wardrobeRecoveryExpiry } from "@/lib/wardrobe";
import { wardrobeUpdateSchema } from "@/lib/validations";

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

async function activeItemId(params: RouteContext["params"], ownerId: string) {
  const { itemId } = await params;
  const item = await getPrisma().wardrobeItem.findFirst({
    where: { id: itemId, user: { clerkId: ownerId }, deletedAt: null },
    select: { id: true },
  });
  return item?.id;
}

/** Update one or more currently confirmed attributes on the owner's active item. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = wardrobeUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const id = await activeItemId(params, userId);
    if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const item = await getPrisma().wardrobeItem.update({
      where: { id },
      data: parsed.data,
      select: itemSelect,
    });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Wardrobe item update failed", error);
    return NextResponse.json(
      { error: "We couldn't update that item. Please try again." },
      { status: 500 },
    );
  }
}

/** Start the recoverable-deletion lifecycle for the owner's active item. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = await activeItemId(params, userId);
    if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const deletedAt = new Date();
    const item = await getPrisma().wardrobeItem.update({
      where: { id },
      data: {
        deletedAt,
        recoveryExpiresAt: wardrobeRecoveryExpiry(deletedAt),
      },
      select: itemSelect,
    });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Wardrobe item deletion failed", error);
    return NextResponse.json(
      { error: "We couldn't delete that item. Please try again." },
      { status: 500 },
    );
  }
}
