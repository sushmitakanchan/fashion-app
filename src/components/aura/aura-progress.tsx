import * as React from "react";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  auraProgressSummary,
  type AuraStep,
  type AuraStepStatus,
} from "@/lib/aura-form-progress";

/**
 * The live completion indicator. The 1-2-3 markers reflect what the user has
 * filled in, so they read as a status readout rather than navigation — you
 * never click them, they respond to the form.
 *
 * Completion is never colour alone (WCAG 1.4.1): a done step is a filled marker
 * with a checkmark, an outstanding one is an outlined marker with its number,
 * and the optional one is dashed — three distinguishable shapes. The visual row
 * is `aria-hidden` because it restates the section headings below it; the one
 * thing assistive tech does hear is the polite live region, which announces
 * only when the required-done count changes.
 */
function stampClass(status: AuraStepStatus): string {
  switch (status) {
    case "done":
      return "bg-upload-accent text-upload-accent-foreground";
    case "todo":
      return "bg-card text-foreground border-2 border-upload-accent";
    case "optional":
      return "text-muted-foreground border-2 border-dashed border-muted-foreground/40 text-[13px]";
  }
}

export function AuraProgress({ steps }: { steps: AuraStep[] }) {
  return (
    <div className="mb-10">
      <div aria-hidden="true" className="flex items-center">
        {steps.map((step, index) => (
          <React.Fragment key={step.key}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "font-heading flex size-8 shrink-0 items-center justify-center rounded-full text-sm",
                  stampClass(step.status),
                )}
              >
                {step.status === "done" ? (
                  <CheckIcon className="size-4" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold tracking-wider uppercase",
                  step.status === "optional"
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className="mx-3 h-0.5 flex-1 [background:repeating-linear-gradient(90deg,var(--border)_0_6px,transparent_6px_11px)]" />
            )}
          </React.Fragment>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {auraProgressSummary(steps)}
      </p>
      <p className="text-muted-foreground mt-3 font-mono text-[11px]">
        Fills as you complete each section.
      </p>
    </div>
  );
}
