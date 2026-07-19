export type PortraitRequest =
  | "idle"
  | "generating"
  | "retryable-failure"
  | "refused"
  | "unavailable";

export type PortraitPresentation = {
  image: "empty" | "portrait";
  pending: boolean;
  primaryAction?: "generate" | "retry" | "edit-references";
  title: string;
  description: string;
};

/**
 * Keeps the portrait result UI honest about the work that has — and has not —
 * completed. It deliberately models an indeterminate request rather than
 * inventing completion percentages for an external image-generation service.
 */
export function portraitPresentation({
  portraitUrl,
  request,
}: {
  portraitUrl?: string;
  request: PortraitRequest;
}): PortraitPresentation {
  if (request === "generating") {
    const regenerating = Boolean(portraitUrl);
    return {
      image: regenerating ? "portrait" : "empty",
      pending: true,
      primaryAction: undefined,
      title: regenerating
        ? "Creating your new AURA portrait"
        : "Creating your AURA portrait",
      description: regenerating
        ? "Your current AURA portrait will stay in place until the new portrait is ready."
        : "OpenAI is creating your studio-style AURA portrait from your saved full-body and face reference photos.",
    };
  }

  if (request === "refused") {
    return {
      image: portraitUrl ? "portrait" : "empty",
      pending: false,
      primaryAction: "edit-references",
      title: "Use different AURA reference photos",
      description:
        "OpenAI couldn't create a portrait from these photos. Add a new full-body front photo and face close-up, then try again.",
    };
  }

  if (request === "retryable-failure") {
    return {
      image: portraitUrl ? "portrait" : "empty",
      pending: false,
      primaryAction: "retry",
      title: "We couldn't create your AURA portrait",
      description: portraitUrl
        ? "Your existing AURA portrait is unchanged. Try again when you're ready."
        : "Your saved reference photos are still available. Try again when you're ready.",
    };
  }

  if (request === "unavailable") {
    return {
      image: portraitUrl ? "portrait" : "empty",
      pending: false,
      primaryAction: undefined,
      title: "AURA portrait generation is unavailable",
      description:
        "Your saved profile and any existing AURA portrait are unchanged. You can edit your profile or try again later.",
    };
  }

  if (portraitUrl) {
    return {
      image: "portrait",
      pending: false,
      primaryAction: "generate",
      title: "Your AURA portrait is ready",
      description:
        "This studio-style AURA portrait was created by OpenAI from your saved full-body and face reference photos.",
    };
  }

  return {
    image: "empty",
    pending: false,
    primaryAction: "generate",
    title: "Your AURA profile is saved",
    description:
      "Create your static, studio-style AURA portrait from your saved full-body and face reference photos.",
  };
}
