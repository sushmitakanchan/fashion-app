import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  admitGoogleAuraIdentity,
  resolveInitialAuraDisplayName,
} from "@/lib/aura-identity";
import { getPrisma } from "@/lib/prisma";
import { AuraForm } from "@/components/forms/aura-form";

export const metadata: Metadata = {
  title: "Your AURA profile",
  description: "Save the profile and reference photos for your AURA portrait.",
};

// Resource-based protection, the pattern Clerk recommends over middleware path
// matching: the AURA profile is tied to a Clerk user, so there's nothing to
// show — or save — when signed out. `auth()` + `redirect()` (rather than
// `auth.protect()`) degrades to a redirect instead of erroring.
export default async function AuraPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;

  // A profile the returning visitor has already saved. When present, the form
  // opens on the result view instead of the empty creation screen — this is the
  // fix for "clicking Profile again just shows the create form", since the
  // saved-state used to live only in ephemeral client state.
  let savedProfile: {
    name: string;
    photoFrontUrl: string;
    portraitUrl: string | null;
  } | null = null;

  // Refused identities do not need profile data and must not reach the database.
  // The route handler returns the clear 403 when they attempt to save.
  if (admission?.ok) {
    try {
      const user = await getPrisma().user.findUnique({
        where: { clerkId: userId },
        select: {
          auraProfile: {
            select: { name: true, photoFrontUrl: true, portraitUrl: true },
          },
        },
      });
      savedProfile = user?.auraProfile ?? null;
    } catch {
      // The save endpoint remains the authoritative live-config failure boundary.
      // Falling back here lets a first-time form still show its empty placeholder.
      savedProfile = null;
    }
  }

  const initialName = resolveInitialAuraDisplayName({
    persistedName: savedProfile?.name ?? null,
    googleName: admission?.ok ? admission.googleName : null,
  });

  return (
    <main className="min-h-[calc(100vh-4rem)]">
      <AuraForm
        initialName={initialName}
        initialProfile={
          savedProfile
            ? {
                photoFrontUrl: savedProfile.photoFrontUrl,
                portraitUrl: savedProfile.portraitUrl,
              }
            : null
        }
        avatarUrl={clerkUser?.imageUrl}
      />
    </main>
  );
}
