import { currentUser } from "@clerk/nextjs/server";

import type { getPrisma } from "@/lib/prisma";

type PrismaClient = ReturnType<typeof getPrisma>;

/**
 * Resolve the internal `User.id` for a Clerk id, provisioning the row on first
 * use. Nothing but AURA submission creates a user today, so a participant who
 * reaches the wardrobe (import, analysis consent, or save) before ever saving an
 * AURA profile would otherwise dead-end. Mirrors the minimum from Clerk and only
 * needs an email when it actually has to create the row; returns `null` when a
 * new user can't be created because Clerk exposes no email.
 */
export async function getOrProvisionUserId(
  prisma: PrismaClient,
  clerkId: string,
): Promise<string | null> {
  const existing = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) return null;

  const created = await prisma.user.create({
    data: {
      clerkId,
      email,
      name: clerkUser?.fullName ?? null,
      imageUrl: clerkUser?.imageUrl ?? null,
    },
    select: { id: true },
  });
  return created.id;
}
