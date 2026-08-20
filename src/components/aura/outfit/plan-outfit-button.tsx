"use client";

import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The per-event "Plan this outfit" action, shown on an unplanned, non-past
 *  event. Clicking it runs one AI planner call (raising the Smart Planning
 *  disclosure first if consent isn't active yet). */
export function PlanOutfitButton({
  planning,
  disabled,
  onPlan,
}: {
  planning: boolean;
  disabled: boolean;
  onPlan: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onPlan}
      disabled={planning || disabled}
      className="rounded-full"
    >
      {planning ? (
        <>
          <Loader2 className="animate-spin" />
          Planning…
        </>
      ) : (
        <>
          <Sparkles />
          Plan this outfit
        </>
      )}
    </Button>
  );
}
