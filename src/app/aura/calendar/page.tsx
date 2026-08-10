import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { getPrisma } from "@/lib/prisma";
import { CalendarSurface } from "@/components/aura/calendar-surface";

export const metadata: Metadata = {
  title: "Outfit Calendar",
  description: "Plan what you'll wear, one occasion at a time — a Monday-start agenda week.",
};

// Resource-based protection, mirroring `/aura/try-on`: the calendar plans outfits
// from the signed-in user's own wardrobe against their saved portrait, so a
// signed-out or portrait-less identity has nothing to plan for. `auth()` +
// `redirect()` degrades to a redirect rather than erroring. Opening the calendar
// itself is a pure read — this page makes zero AI calls and no external requests.
export default async function CalendarPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;
  if (!admission?.ok) {
    redirect("/aura");
  }

  // The calendar's outfit planning (later tickets) is anchored to the saved
  // portrait, exactly like try-on. Confirm it exists before rendering — a
  // portrait-less profile is routed to `/aura` to create the prerequisite rather
  // than hitting a dead end. Read outside the redirect so the NEXT_REDIRECT
  // thrown by `redirect()` is never swallowed by the catch.
  let portraitUrl: string | null = null;
  try {
    const user = await getPrisma().user.findUnique({
      where: { clerkId: userId },
      select: { auraProfile: { select: { portraitUrl: true } } },
    });
    portraitUrl = user?.auraProfile?.portraitUrl ?? null;
  } catch {
    portraitUrl = null;
  }

  if (!portraitUrl) {
    redirect("/aura");
  }

  return <CalendarSurface />;
}
