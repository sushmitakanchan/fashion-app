import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { getPrisma } from "@/lib/prisma";

const wardrobeCategorySchema = z.enum([
  "tops",
  "bottoms",
  "bags",
  "shoes",
  "accessories",
]);

/** List the authenticated participant's active wardrobe, optionally by category. */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedCategory = new URL(request.url).searchParams.get("category");
  const category = requestedCategory
    ? wardrobeCategorySchema.safeParse(requestedCategory)
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
