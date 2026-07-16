import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Resource-based protection: the auth check lives with the data it guards,
// which is the pattern Clerk recommends over middleware path matching. We use
// `auth()` + `redirect()` (rather than `auth.protect()`) so the route degrades
// gracefully to a redirect when signed out instead of erroring.
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    // Signed-out visitors go home, where they can open the sign-in modal.
    redirect("/");
  }
  const user = await currentUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <Card>
        <CardHeader>
          <CardTitle>
            Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
          </CardTitle>
          <CardDescription>
            This page is protected by <code>auth.protect()</code>. Unauthenticated
            visitors are redirected to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Signed in as{" "}
          {user?.emailAddresses[0]?.emailAddress ?? "your account"}.
        </CardContent>
      </Card>
    </main>
  );
}
