"use client";

import * as React from "react";

import { SMART_PLANNING_DISCLOSURE } from "@/lib/planning-policy";
import { Button } from "@/components/ui/button";

/** The versioned Smart Planning disclosure. It appears before the first outside
 *  contact and, on agreement, records consent for the disclosed policy version —
 *  after which weather may be fetched.
 *
 *  Shared by the two places consent can be granted: the calendar's just-in-time
 *  prompt and the settings toggle. Both must show the *same* wording, since the
 *  version they echo to the consent route is what that consent is recorded
 *  against. */
export function SmartPlanningDisclosure({
  onAgree,
  onCancel,
}: {
  onAgree: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="bg-brand-ink/35 fixed inset-0 z-50 grid place-items-end p-3 backdrop-blur-sm sm:place-items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-planning-disclosure-title"
        className="bg-card text-card-foreground w-full max-w-md rounded-3xl border p-5 shadow-2xl sm:p-7"
      >
        <h2
          id="smart-planning-disclosure-title"
          className="font-heading text-2xl tracking-wide uppercase"
        >
          Turn on Smart Planning
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-pretty">
          {SMART_PLANNING_DISCLOSURE}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Not now
          </Button>
          <Button type="button" onClick={onAgree}>
            Turn on Smart Planning
          </Button>
        </div>
      </section>
    </div>
  );
}
