"use client";

import * as React from "react";

import type { Slot } from "@/lib/aura-provenance";

/**
 * Holds the try-on composer's attached garments (its {@link Slot}s) *above* the
 * route, so they survive client-side navigation between the try-on surface and
 * the wardrobe gallery. Picking pieces is a round trip — the try-on surface sends
 * the participant to `/wardrobe` to select, and they return to `/aura/try-on` —
 * and only state lifted out of the unmounting page can be preserved across it.
 *
 * The store keeps the try-on's existing ephemerality: it lives entirely in
 * memory, so a full reload (or closing the tab) still clears the composer, and
 * the browser reclaims any upload object URLs with the document. Revocation for
 * pieces the user actively removes or generates stays in the surface, which owns
 * that lifecycle; the provider only has to keep the slots alive between routes.
 */

type TryOnComposerValue = {
  slots: Slot[];
  setSlots: React.Dispatch<React.SetStateAction<Slot[]>>;
};

const TryOnComposerContext = React.createContext<TryOnComposerValue | null>(
  null,
);

export function TryOnComposerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const value = React.useMemo(() => ({ slots, setSlots }), [slots]);
  return (
    <TryOnComposerContext.Provider value={value}>
      {children}
    </TryOnComposerContext.Provider>
  );
}

export function useTryOnComposer(): TryOnComposerValue {
  const context = React.useContext(TryOnComposerContext);
  if (!context) {
    throw new Error(
      "useTryOnComposer must be used within a TryOnComposerProvider",
    );
  }
  return context;
}
