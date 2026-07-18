import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { auraMode } from "@/lib/aura-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const mode = auraMode();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-2xl">Create your AURA profile</CardTitle>
            {mode === "preview" && <Badge variant="secondary">Local preview</Badge>}
          </div>
          <CardDescription className="text-pretty">
            Save the body-profile information used for fit and two AURA
            reference photos for your portrait. Optional 3D avatar photos are
            clearly marked in the form and can be updated later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuraForm mode={mode} />
        </CardContent>
      </Card>
    </main>
  );
}
