import { describe, expect, it } from "bun:test";

import {
  auraProgressSummary,
  auraRequiredProgress,
  deriveAuraSteps,
} from "@/lib/aura-form-progress";

describe("deriveAuraSteps", () => {
  it("starts with both required sections outstanding and optional distinct", () => {
    const steps = deriveAuraSteps({
      name: "",
      hasFront: false,
      hasCloseup: false,
    });
    expect(steps.map((s) => [s.key, s.status])).toEqual([
      ["name", "todo"],
      ["photos", "todo"],
      ["optional", "optional"],
    ]);
  });

  it("treats the name as done only once it clears the schema's minimum length", () => {
    expect(
      deriveAuraSteps({ name: "A", hasFront: false, hasCloseup: false })[0]
        .status,
    ).toBe("todo");
    expect(
      deriveAuraSteps({ name: "Ada", hasFront: false, hasCloseup: false })[0]
        .status,
    ).toBe("done");
  });

  it("ignores surrounding whitespace the way the trimmed schema does", () => {
    expect(
      deriveAuraSteps({ name: "  A  ", hasFront: false, hasCloseup: false })[0]
        .status,
    ).toBe("todo");
    expect(
      deriveAuraSteps({ name: "  Ab  ", hasFront: false, hasCloseup: false })[0]
        .status,
    ).toBe("done");
  });

  it("marks photos done only when both required references are present", () => {
    const only = deriveAuraSteps({
      name: "Ada",
      hasFront: true,
      hasCloseup: false,
    });
    expect(only[1].status).toBe("todo");

    const both = deriveAuraSteps({
      name: "Ada",
      hasFront: true,
      hasCloseup: true,
    });
    expect(both[1].status).toBe("done");
  });

  it("keeps the optional section optional regardless of the other fields", () => {
    const steps = deriveAuraSteps({
      name: "Ada",
      hasFront: true,
      hasCloseup: true,
    });
    expect(steps[2].status).toBe("optional");
  });
});

describe("auraRequiredProgress", () => {
  it("counts only the required sections", () => {
    const steps = deriveAuraSteps({
      name: "Ada",
      hasFront: true,
      hasCloseup: false,
    });
    expect(auraRequiredProgress(steps)).toEqual({ done: 1, total: 2 });
  });
});

describe("auraProgressSummary", () => {
  it("phrases the required tally for the live region", () => {
    const empty = deriveAuraSteps({
      name: "",
      hasFront: false,
      hasCloseup: false,
    });
    expect(auraProgressSummary(empty)).toBe("0 of 2 required sections complete");

    const done = deriveAuraSteps({
      name: "Ada",
      hasFront: true,
      hasCloseup: true,
    });
    expect(auraProgressSummary(done)).toBe("2 of 2 required sections complete");
  });
});
