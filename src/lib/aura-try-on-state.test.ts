import { describe, expect, it } from "bun:test";

import { tryOnPresentation } from "./aura-try-on-state";

const RESULT = "data:image/png;base64,AAAA";

describe("tryOnPresentation", () => {
  it("shows an empty stage that invites the first garment", () => {
    expect(
      tryOnPresentation({ resultUrl: undefined, request: "idle" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      primaryAction: "attach",
      title: "See a garment on your portrait",
      description:
        "Your AURA portrait is the fixed subject. Attach a garment image and generate the look.",
    });
  });

  it("moves to a generate-ready composer once garments are attached", () => {
    expect(
      tryOnPresentation({ resultUrl: undefined, request: "composing" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      primaryAction: "generate",
      title: "Ready to generate your look",
      description:
        "Your attached garment(s) are worn together in one result. Generate the look when you're ready.",
    });
  });

  it("keeps the try-on indeterminate while the first look generates", () => {
    expect(
      tryOnPresentation({ resultUrl: undefined, request: "generating" }),
    ).toMatchObject({
      image: "empty",
      pending: true,
      primaryAction: undefined,
      title: "Putting the look together",
      description:
        "This can take up to ~2 minutes while OpenAI wears your garment(s) on your AURA portrait.",
    });
  });

  it("keeps the current look in place while a replacement generates", () => {
    expect(
      tryOnPresentation({ resultUrl: RESULT, request: "generating" }),
    ).toMatchObject({
      image: "result",
      pending: true,
      primaryAction: undefined,
      title: "Putting your new look together",
      description:
        "Your current look stays in place until the new one is ready.",
    });
  });

  it("offers a retry after a retryable failure without a prior look", () => {
    expect(
      tryOnPresentation({ resultUrl: undefined, request: "retryable-failure" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      primaryAction: "retry",
      title: "That try-on didn't come through",
      description:
        "Nothing was saved. You can try the same garment again when you're ready.",
    });
  });

  it("offers a retry after a retryable failure while keeping the prior look", () => {
    expect(
      tryOnPresentation({ resultUrl: RESULT, request: "retryable-failure" }),
    ).toMatchObject({
      image: "result",
      pending: false,
      primaryAction: "retry",
      title: "That try-on didn't come through",
      description:
        "Nothing was saved. You can try the same garment again when you're ready.",
    });
  });

  it("guides a refusal to a different garment rather than a same-garment retry", () => {
    expect(
      tryOnPresentation({ resultUrl: undefined, request: "refused" }),
    ).toMatchObject({
      image: "empty",
      pending: false,
      primaryAction: "attach-different-garment",
      title: "Use a different garment",
      description:
        "OpenAI couldn't create a look from this garment. Nothing was saved. Attach a different garment, then try again.",
    });
  });

  it("keeps a prior look visible when a fresh generation is refused", () => {
    expect(
      tryOnPresentation({ resultUrl: RESULT, request: "refused" }),
    ).toMatchObject({
      image: "result",
      primaryAction: "attach-different-garment",
      title: "Use a different garment",
      description:
        "OpenAI couldn't create a look from this garment. Nothing was saved. Attach a different garment, then try again.",
    });
  });

  it("displays a ready look and lets the user generate again", () => {
    expect(
      tryOnPresentation({ resultUrl: RESULT, request: "idle" }),
    ).toMatchObject({
      image: "result",
      pending: false,
      primaryAction: "generate",
      title: "Your look is ready",
      description:
        "Here's your AURA portrait wearing the garment(s) you attached. Generate again to refresh the look, or attach a different garment.",
    });
  });

  it("keeps a prior look visible while composing the next one", () => {
    expect(
      tryOnPresentation({ resultUrl: RESULT, request: "composing" }),
    ).toMatchObject({
      image: "result",
      pending: false,
      primaryAction: "generate",
      title: "Ready to generate your look",
      description:
        "Your attached garment(s) are worn together in one result. Generate the look when you're ready.",
    });
  });
});
