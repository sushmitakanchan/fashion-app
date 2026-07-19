export type TryOnRequest =
  | "idle"
  | "composing"
  | "generating"
  | "retryable-failure"
  | "refused";

export type TryOnPresentation = {
  image: "empty" | "result";
  pending: boolean;
  primaryAction?: "attach" | "generate" | "retry" | "attach-different-garment";
  title: string;
  description: string;
};

/**
 * Keeps the ephemeral try-on stage honest about the work that has — and has not
 * — completed. Like {@link import("./aura-portrait-state").portraitPresentation}
 * it models an indeterminate generation rather than inventing completion
 * percentages for an external image-editing service, and it treats a fresh
 * generation as a replacement for any look already on screen — nothing about the
 * try-on is persisted.
 */
export function tryOnPresentation({
  resultUrl,
  request,
}: {
  resultUrl?: string;
  request: TryOnRequest;
}): TryOnPresentation {
  if (request === "generating") {
    const regenerating = Boolean(resultUrl);
    return {
      image: regenerating ? "result" : "empty",
      pending: true,
      primaryAction: undefined,
      title: regenerating
        ? "Putting your new look together"
        : "Putting the look together",
      description: regenerating
        ? "Your current look stays in place until the new one is ready."
        : "This can take up to ~2 minutes while OpenAI wears your garment(s) on your AURA portrait.",
    };
  }

  if (request === "refused") {
    return {
      image: resultUrl ? "result" : "empty",
      pending: false,
      primaryAction: "attach-different-garment",
      title: "Use a different garment",
      description:
        "OpenAI couldn't create a look from this garment. Nothing was saved. Attach a different garment, then try again.",
    };
  }

  if (request === "retryable-failure") {
    return {
      image: resultUrl ? "result" : "empty",
      pending: false,
      primaryAction: "retry",
      title: "That try-on didn't come through",
      description:
        "Nothing was saved. You can try the same garment again when you're ready.",
    };
  }

  if (request === "composing") {
    return {
      image: resultUrl ? "result" : "empty",
      pending: false,
      primaryAction: "generate",
      title: "Ready to generate your look",
      description:
        "Your attached garment(s) are worn together in one result. Generate the look when you're ready.",
    };
  }

  if (resultUrl) {
    return {
      image: "result",
      pending: false,
      primaryAction: "generate",
      title: "Your look is ready",
      description:
        "Here's your AURA portrait wearing the garment(s) you attached. Generate again to refresh the look, or attach a different garment.",
    };
  }

  return {
    image: "empty",
    pending: false,
    primaryAction: "attach",
    title: "See a garment on your portrait",
    description:
      "Your AURA portrait is the fixed subject. Attach a garment image and generate the look.",
  };
}
