import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { CalendarSettings } from "@/components/aura/calendar-settings";

export const metadata: Metadata = {
  title: "Calendar settings",
  description:
    "Review and undo the outside-contact grants — Smart Planning and Google Calendar.",
};

// The review surface for the Outfit Calendar's outside-contact grants (spec §7):
// review and revoke Smart Planning, disconnect Google. Distinct from the
// just-in-time grant surfaces on the calendar itself. Resource-based protection
// mirrors `/aura/calendar`, but there's no portrait requirement here — a user
// with a lingering grant should always be able to review and revoke it, even
// before (or without) a portrait. Opening this page makes zero outside contact.
export default async function CalendarSettingsPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;
  if (!admission?.ok) {
    redirect("/aura");
  }

  return <CalendarSettings />;
}
