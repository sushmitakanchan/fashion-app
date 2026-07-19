import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import type { SavedLookSource } from "@/lib/aura-style-book";
import { getPrisma } from "@/lib/prisma";
import {
  StyleBookGallery,
  type StyleBookLook,
} from "@/components/aura/style-book-gallery";

export const metadata: Metadata = {
  title: "Your Style Book",
  description: "Your private, newest-first gallery of saved AURA looks.",
};

/** Defensive ceiling on a load-all listing — not user-facing pagination, just a
 * backstop so a pathological book can't unbounded the query. */
const MAX_LOOKS = 100;

/**
 * The Style Book browse surface — a Server Component sibling of `/aura/try-on`.
 *
 * Protection mirrors try-on's resource gate: no `userId` → `redirect("/")`; an
 * identity that `admitGoogleAuraIdentity` refuses → `redirect("/aura")`. The one
 * deliberate divergence is that the **portrait-existence check is dropped** —
 * the Style Book's subject is already-saved looks, not a live portrait, so a
 * currently-missing portrait must never hide a participant's own history. Zero
 * looks resolves to the in-page empty state, not a redirect.
 */
export default async function StyleBookPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const clerkUser = await currentUser();
  const admission = clerkUser ? admitGoogleAuraIdentity(clerkUser) : null;
  if (!admission?.ok) {
    redirect("/aura");
  }

  // Ownership-scoped listing: the looks are reached *through* the owning user
  // (`user: { clerkId }`), never fetched by id alone, so no crafted request can
  // surface another participant's look. Newest-first, load-all with a defensive
  // `take` backstop. A thrown query is caught by the route-level `error.tsx`
  // boundary (distinct from the empty state) — so this read is intentionally
  // not wrapped in a try/catch here.
  const rows = await getPrisma().savedLook.findMany({
    where: { user: { clerkId: userId } },
    orderBy: { createdAt: "desc" },
    take: MAX_LOOKS,
    select: {
      id: true,
      caption: true,
      lookImageUrl: true,
      createdAt: true,
      sources: true,
    },
  });

  const looks: StyleBookLook[] = rows.map((row) => ({
    id: row.id,
    caption: row.caption,
    lookImageUrl: row.lookImageUrl,
    // `Date` isn't serialisable across the Server → Client boundary; the grid
    // formats the ISO string.
    createdAt: row.createdAt.toISOString(),
    // The sources column is untyped `Json` (the DB doesn't validate it); it is
    // Zod-guarded at write time, so we narrow to the persisted shape on read.
    sources: (row.sources ?? []) as unknown as SavedLookSource[],
  }));

  return <StyleBookGallery looks={looks} />;
}
