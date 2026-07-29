import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { signedWardrobeMediaUrl } from "@/lib/wardrobe-media";
import { getPrisma } from "@/lib/prisma";

const mediaVariantSchema = z.enum(["original", "normalized"]);

type RouteContext = { params: Promise<{ itemId: string }> };

/** Return an owner-authorized, short-lived URL for one private media rendition. */
export async function GET(request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const variant = mediaVariantSchema.safeParse(
    new URL(request.url).searchParams.get("variant"),
  );
  if (!variant.success) {
    return NextResponse.json({ error: "Invalid media variant" }, { status: 400 });
  }

  const { itemId } = await params;
  try {
    // Ownership and active lifecycle state are part of the lookup. A foreign or
    // recoverably deleted item is indistinguishable from an unknown id.
    const item = await getPrisma().wardrobeItem.findFirst({
      where: { id: itemId, user: { clerkId: userId }, deletedAt: null },
      select: {
        originalMediaId: true,
        originalMediaFormat: true,
        normalizedMediaId: true,
        normalizedMediaFormat: true,
      },
    });
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const media =
      variant.data === "original"
        ? signedWardrobeMediaUrl(item.originalMediaId, item.originalMediaFormat)
        : signedWardrobeMediaUrl(item.normalizedMediaId, item.normalizedMediaFormat);

    return NextResponse.json({
      url: media.url,
      expiresAt: media.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error("Wardrobe media authorization failed", error);
    return NextResponse.json(
      { error: "We couldn't prepare that image. Please try again." },
      { status: 500 },
    );
  }
}
