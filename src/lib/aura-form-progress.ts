import { AURA_NAME_MIN_LENGTH } from "@/lib/validations";

/**
 * Completion state for the AURA form's progress indicator, derived from the
 * live form values. This is presentation only — the authoritative gate is the
 * Zod schema on submit — but the "done" rules mirror the schema's so the
 * indicator can never say a section is complete when the schema would reject
 * it (the name length is the schema's own constant).
 *
 * `optional` is its own status, distinct from `todo`: the 3D-avatar section is
 * never required, so it must not read as an unfinished required step.
 */
export type AuraStepStatus = "done" | "todo" | "optional";

export type AuraStepKey = "name" | "photos" | "optional";

export type AuraStep = {
  key: AuraStepKey;
  label: string;
  status: AuraStepStatus;
};

export function deriveAuraSteps(input: {
  name: string | undefined;
  hasFront: boolean;
  hasCloseup: boolean;
}): AuraStep[] {
  const nameDone = (input.name ?? "").trim().length >= AURA_NAME_MIN_LENGTH;
  const photosDone = input.hasFront && input.hasCloseup;

  return [
    { key: "name", label: "Name", status: nameDone ? "done" : "todo" },
    { key: "photos", label: "Photos", status: photosDone ? "done" : "todo" },
    { key: "optional", label: "Optional", status: "optional" },
  ];
}

/** Required-only tally — the optional section is excluded from both counts. */
export function auraRequiredProgress(steps: AuraStep[]): {
  done: number;
  total: number;
} {
  const required = steps.filter((step) => step.status !== "optional");
  return {
    done: required.filter((step) => step.status === "done").length,
    total: required.length,
  };
}

/**
 * The polite-live-region text. It changes only when the required-done count
 * changes, so assistive tech announces a section completing rather than every
 * keystroke.
 */
export function auraProgressSummary(steps: AuraStep[]): string {
  const { done, total } = auraRequiredProgress(steps);
  return `${done} of ${total} required sections complete`;
}
