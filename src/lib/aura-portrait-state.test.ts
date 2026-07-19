import { describe, expect, it } from "bun:test";

import { portraitPresentation } from "./aura-portrait-state";

describe("portraitPresentation", () => {
  it("keeps the portrait state indeterminate while an initial generation runs", () => {
    expect(
      portraitPresentation({ portraitUrl: undefined, request: "generating" }),
    ).toMatchObject({
      image: "empty",
      pending: true,
      primaryAction: undefined,
      title: "Creating your AURA portrait",
    });
  });

  it("dims the current portrait while a regeneration is pending", () => {
    expect(
      portraitPresentation({
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
      portraitPresentation({ portraitUrl: undefined, request: "refused" }),
    ).toMatchObject({
      image: "empty",
      primaryAction: "edit-references",
      title: "Use different AURA reference photos",
    });
  });

  it("does not offer a retry for another non-retryable failure", () => {
    expect(
      portraitPresentation({ portraitUrl: undefined, request: "unavailable" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      primaryAction: undefined,
      title: "AURA portrait generation is unavailable",
    });
  });

  it("starts generation only from a saved profile", () => {
    expect(
      portraitPresentation({ portraitUrl: undefined, request: "idle" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      title: "Your AURA profile is saved",
    });
  });
});
