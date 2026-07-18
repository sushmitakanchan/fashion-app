import { describe, expect, it } from "bun:test";

import { portraitPresentation } from "./aura-portrait-state";

describe("portraitPresentation", () => {
  it("keeps the portrait state indeterminate while an initial generation runs", () => {
    expect(
      portraitPresentation({ mode: "live", portraitUrl: undefined, request: "generating" }),
    ).toMatchObject({
      image: "placeholder",
      pending: true,
      primaryAction: undefined,
      title: "Creating your AURA portrait",
    });
  });

  it("dims the current portrait while a regeneration is pending", () => {
    expect(
      portraitPresentation({
        mode: "live",
        portraitUrl: "https://res.cloudinary.com/aura/portrait.jpg",
        request: "generating",
      }),
    ).toMatchObject({
      image: "portrait",
      pending: true,
      title: "Creating your new AURA portrait",
    });
  });

  it("offers a retry after a retryable failure without discarding the portrait", () => {
    expect(
      portraitPresentation({
        mode: "live",
        portraitUrl: "https://res.cloudinary.com/aura/portrait.jpg",
        request: "retryable-failure",
      }),
    ).toMatchObject({
      image: "portrait",
      pending: false,
      primaryAction: "retry",
      title: "We couldn't create your AURA portrait",
    });
  });

  it("guides a provider refusal to different reference photos", () => {
    expect(
      portraitPresentation({ mode: "live", portraitUrl: undefined, request: "refused" }),
    ).toMatchObject({
      image: "placeholder",
      primaryAction: "edit-references",
      title: "Use different AURA reference photos",
    });
  });

  it("does not offer a retry for another non-retryable failure", () => {
    expect(
      portraitPresentation({ mode: "live", portraitUrl: undefined, request: "unavailable" }),
    ).toMatchObject({
      image: "placeholder",
      pending: false,
      primaryAction: undefined,
      title: "AURA portrait generation is unavailable",
    });
  });

  it("labels local preview as a placeholder rather than a generated portrait", () => {
    expect(
      portraitPresentation({ mode: "preview", portraitUrl: undefined, request: "idle" }),
    ).toMatchObject({
      image: "placeholder",
      pending: false,
      title: "AURA portrait preview",
    });
  });
});
