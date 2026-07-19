"use client";

/** PROTOTYPE — throwaway. Shared save-state machine (logic only; each variant
 * renders the affordance its own way). Mimics the client-only in-flight guard
 * decided in #81: idle → saving → saved, terminal once saved. */

import * as React from "react";
import { toast } from "sonner";

export type SaveState = "idle" | "saving" | "saved";

export function useSaveState() {
  const [state, setState] = React.useState<SaveState>("idle");

  const save = React.useCallback(() => {
    if (state !== "idle") return; // in-flight + terminal guard
    setState("saving");
    // Fake latency — no real mutation (prototype is read-only per skill rules).
    window.setTimeout(() => {
      setState("saved");
      toast.success("Saved to your Style Book", {
        description: "Oversized wool coat + pleated trousers",
        action: { label: "View", onClick: () => {} },
      });
    }, 1100);
  }, [state]);

  const reset = React.useCallback(() => setState("idle"), []);

  return { state, save, reset };
}
