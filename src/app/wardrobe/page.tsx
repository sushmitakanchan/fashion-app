import type { Metadata } from "next";

import { WardrobeGallery } from "@/components/wardrobe/wardrobe-gallery";

export const metadata: Metadata = {
  title: "Wardrobe",
  description: "Browse your AURA wardrobe by category.",
};

export default function WardrobePage() {
  return <WardrobeGallery />;
}
