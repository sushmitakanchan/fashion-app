import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { WardrobeImport } from "@/components/wardrobe/wardrobe-import";

export const metadata: Metadata = {
  title: "Import wardrobe",
  description: "Import and confirm a batch of clothing images into your private AURA wardrobe.",
};

export default async function WardrobeImportPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  return <WardrobeImport />;
}
