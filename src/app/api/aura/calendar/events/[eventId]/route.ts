import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ eventId: string }> };

/**
 * Hard-delete one planned event. Planned events have no soft-delete lifecycle —
 * the timeline is the archive, and manual deletion is the only way anything
 * leaves it. Scoped to the owner: the delete only matches an event that both has
 * this id and belongs to the caller, so a foreign id resolves to a 404 rather
 * than touching another user's calendar. The 1:1 outfit (a later ticket)
 * cascades away with the event by the schema's `onDelete: Cascade`.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;

  try {
    const prisma = getPrisma();
    const event = await prisma.plannedEvent.findFirst({
      where: { id: eventId, user: { clerkId: userId } },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.plannedEvent.delete({ where: { id: event.id } });
    return NextResponse.json({ id: event.id });
  } catch (error) {
    console.error("Calendar event deletion failed", error);
    return NextResponse.json(
      { error: "We couldn't delete that event. Please try again." },
      { status: 500 },
    );
  }
}
