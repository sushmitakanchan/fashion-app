import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { getPrisma } from "@/lib/prisma";
import { eventSelect, serializeEvent } from "@/lib/planned-event";
import { EventOutfitSurface } from "@/components/aura/event-outfit-surface";

export const metadata: Metadata = {
  title: "Event outfit",
  description: "Plan, preview, and refine the outfit for one calendar event.",
};

type PageProps = { params: Promise<{ eventId: string }> };

// Resource-based protection, mirroring `/aura/calendar`: the detail page plans and
// renders an outfit from the signed-in user's own wardrobe against their saved
// portrait, so a signed-out or portrait-less identity has nothing to plan for.
// `auth()` + `redirect()` degrades to a redirect rather than erroring; a missing
// or foreign event resolves to 404 (the event load is owner-scoped, so another
// user's event is indistinguishable from one that doesn't exist).
export default async function EventOutfitPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;
  if (!admission?.ok) {
    redirect("/aura");
  }

  const { eventId } = await params;

  // The saved portrait anchors preview generation, exactly like the calendar and
  // try-on. Load it alongside the event so a portrait-less profile is routed to
  // `/aura` to create the prerequisite rather than hitting a dead end. Read
  // outside any try/redirect so the NEXT_REDIRECT thrown by `redirect()` is never
  // swallowed. An unconfigured DB (blank checkout) surfaces as a 404 rather than
  // a crash — there's no event to show either way.
  let portraitUrl: string | null = null;
  let event: Awaited<ReturnType<typeof loadEvent>> = null;
  try {
    const prisma = getPrisma();
    const [profile, row] = await Promise.all([
      prisma.user.findUnique({
        where: { clerkId: userId },
        select: { auraProfile: { select: { portraitUrl: true } } },
      }),
      loadEvent(eventId, userId),
    ]);
    portraitUrl = profile?.auraProfile?.portraitUrl ?? null;
    event = row;
  } catch {
    notFound();
  }

  if (!portraitUrl) {
    redirect("/aura");
  }
  if (!event) {
    notFound();
  }

  return <EventOutfitSurface event={serializeEvent(event)} />;
}

/** The one event this page renders, owner-scoped: a foreign id resolves to `null`
 *  (→ 404) rather than exposing another user's calendar. Selects the shared
 *  {@link eventSelect}, so the outfit renders on load without any AI call. */
function loadEvent(eventId: string, clerkId: string) {
  return getPrisma().plannedEvent.findFirst({
    where: { id: eventId, user: { clerkId } },
    select: eventSelect,
  });
}
