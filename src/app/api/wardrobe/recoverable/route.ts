import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";
import { signedWardrobeMediaUrl } from "@/lib/wardrobe-media";

/** List only the caller's still-restorable deletions; expired records are never
 * presented as recoverable, even before the expiry worker removes them. Each
 * item carries a short-lived signed thumbnail URL so the recently-deleted list
 * can show the piece's image alongside its name. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await getPrisma().wardrobeItem.findMany({
      where: {
        user: { clerkId: userId },
        deletedAt: { not: null },
        recoveryExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        name: true,
        recoveryExpiresAt: true,
        normalizedMediaId: true,
        normalizedMediaFormat: true,
      },
      orderBy: { deletedAt: "desc" },
    });

    const items = rows.map(({ normalizedMediaId, normalizedMediaFormat, ...item }) => {
      // A missing/unconfigured media backend must not drop the item from the
      // list — the thumbnail is a nicety, the restore action is the point.
      let imageUrl: string | null = null;
      try {
        imageUrl = signedWardrobeMediaUrl(normalizedMediaId, normalizedMediaFormat).url;
      } catch {
        imageUrl = null;
      }
      return { ...item, imageUrl };
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
