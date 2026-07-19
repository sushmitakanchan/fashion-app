import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { getPrisma } from "@/lib/prisma";
import { TryOnSurface } from "@/components/aura/try-on-surface";

export const metadata: Metadata = {
  title: "Try on a look",
  description: "See a garment worn on your AURA portrait — ephemeral, nothing saved.",
};

// Resource-based protection, mirroring `/aura`: the try-on is generated against
// the signed-in user's own saved portrait, so there is nothing to show when
// signed out or when the identity can't be admitted. `auth()` + `redirect()`
// degrades to a redirect rather than erroring.
export default async function TryOnPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;
  if (!admission?.ok) {
    // Un-admitted identities have no portrait to try on; send them to profile
    // creation, where the clear admission message is surfaced on save.
    redirect("/aura");
  }

  // The subject of every try-on is the saved portrait. Confirm it exists before
  // rendering the surface — a profile with no `portraitUrl` (or a lookup we
  // can't complete) is routed to `/aura` to create the prerequisite rather than
  // hitting a dead end. Read outside the redirect so the NEXT_REDIRECT thrown by
  // `redirect()` is never swallowed by the catch.
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

  return <TryOnSurface />;
}
