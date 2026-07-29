import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { WardrobeGallery } from "@/components/wardrobe/wardrobe-gallery";

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Browse your AURA wardrobe by category.",
};

export default async function WardrobePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return <WardrobeGallery />;
}
