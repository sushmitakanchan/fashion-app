import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";

/** List only the caller's still-restorable deletions; expired records are never
 * presented as recoverable, even before the expiry worker removes them. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const items = await getPrisma().wardrobeItem.findMany({
      where: {
        user: { clerkId: userId },
        deletedAt: { not: null },
        recoveryExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        name: true,
        recoveryExpiresAt: true,
      },
      orderBy: { deletedAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Recoverable wardrobe listing failed", error);
    return NextResponse.json(
      { error: "We couldn't load recently deleted items. Please try again." },
      { status: 500 },
    );
  }
}
