import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  admitGoogleAuraIdentity,
  resolveInitialAuraDisplayName,
} from "@/lib/aura-identity";
import { getPrisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuraForm } from "@/components/forms/aura-form";

export const metadata: Metadata = {
  title: "Create your AURA profile",
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
  let persistedName: string | null = null;

  // Refused identities do not need profile data and must not reach the database.
  // The route handler returns the clear 403 when they attempt to save.
  if (admission?.ok) {
    try {
      const user = await getPrisma().user.findUnique({
        where: { clerkId: userId },
        select: { auraProfile: { select: { name: true } } },
      });
      persistedName = user?.auraProfile?.name ?? null;
    } catch {
      // The save endpoint remains the authoritative live-config failure boundary.
      // Falling back here lets a first-time form still show its empty placeholder.
      persistedName = null;
    }
  }

  const initialName = resolveInitialAuraDisplayName({
    persistedName,
    googleName: admission?.ok ? admission.googleName : null,
  });
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create your AURA profile</CardTitle>
          <CardDescription className="text-pretty">
            Save the body-profile information used for fit and two AURA
            reference photos for your portrait. Optional 3D avatar photos are
            clearly marked in the form and can be updated later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuraForm initialName={initialName} />
        </CardContent>
      </Card>
    </main>
  );
}
