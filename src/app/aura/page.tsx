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
  title: "Generate AURA",
  description: "Build the digital twin behind your personalised fit.",
};

// Same resource-based protection as /dashboard: the AURA profile is tied to a
// Clerk user, so there's nothing to show — or save — when signed out.
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
            <CardTitle className="text-2xl">Generate your AURA</CardTitle>
            {mode === "preview" && <Badge variant="secondary">Local preview</Badge>}
          </div>
          <CardDescription className="text-pretty">
            Your AURA is the digital twin we fit clothes to. Tell us about your
            body and upload five reference photos — you can update any of it
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuraForm mode={mode} />
        </CardContent>
      </Card>
    </main>
  );
}
