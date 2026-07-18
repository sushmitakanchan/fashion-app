import "server-only";

import { getOpenAI } from "@/lib/openai";

const REFERENCE_DOWNLOAD_TIMEOUT_MS = 10_000;
const PORTRAIT_REQUEST_TIMEOUT_MS = 75_000;

const AURA_STUDIO_PROMPT = `
Create one polished, photorealistic, full-body AURA studio portrait.

Image 1 is the subject's full-body, front-facing reference. Image 2 is the
subject's face close-up reference. Use only these images to preserve the
subject's likeness, facial features, hairstyle, skin tone, and natural body
proportions. Do not infer or alter those qualities from measurements or any
other information.

Frame the subject standing naturally, full body visible with feet included,
against a clean warm-neutral studio backdrop. Use soft, flattering editorial
lighting and simple, fitted neutral clothing. Keep the pose relaxed and
front-facing. No text, logos, watermarks, extra people, or collage treatment.
`;

export type AuraPortraitFailureKind =
  | "refused"
  | "timeout"
  | "transient"
  | "invalid-response";

/** A stable, provider-agnostic error contract for the portrait route. */
export class AuraPortraitError extends Error {
  constructor(
    readonly kind: AuraPortraitFailureKind,
    readonly retryable: boolean,
  ) {
    super(kind);
    this.name = "AuraPortraitError";
  }
}

type PortraitReferences = {
  clerkId: string;
  photoFrontUrl: string;
  photoCloseupUrl: string;
};

function isErrorRecord(error: unknown): error is Record<string, unknown> {
  return typeof error === "object" && error !== null;
}

function classifyProviderError(error: unknown): AuraPortraitError {
  if (error instanceof AuraPortraitError) return error;

  const name = error instanceof Error ? error.name : undefined;
  if (name === "AbortError" || name === "TimeoutError") {
    return new AuraPortraitError("timeout", true);
  }

  const record = isErrorRecord(error) ? error : undefined;
  const code = record?.code;
  const status = record?.status;
  if (
    code === "moderation_blocked" ||
    code === "image_generation_user_error" ||
    (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429)
  ) {
    return new AuraPortraitError("refused", false);
  }

  if (status === 408) return new AuraPortraitError("timeout", true);
  return new AuraPortraitError("transient", true);
}

async function referenceFile(url: string, filename: string): Promise<File> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REFERENCE_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AuraPortraitError("transient", true);
  }

  return new File([await response.arrayBuffer()], filename, {
    type: response.headers.get("content-type") ?? "image/jpeg",
  });
}

/**
 * Generates a static AURA portrait from exactly the saved v1 reference photos.
 * This is intentionally OpenAI-specific: text-provider selection has no effect
 * on the image model or its credentials.
 */
export async function generateAuraPortrait({
  clerkId,
  photoFrontUrl,
  photoCloseupUrl,
}: PortraitReferences): Promise<string> {
  try {
    const images = await Promise.all([
      referenceFile(photoFrontUrl, "aura-front.jpg"),
      referenceFile(photoCloseupUrl, "aura-closeup.jpg"),
    ]);
    const result = await getOpenAI().images.edit(
      {
        image: images,
        model: "gpt-image-2",
        prompt: AURA_STUDIO_PROMPT,
        n: 1,
        size: "1024x1536",
        quality: "medium",
        output_format: "jpeg",
        background: "opaque",
        user: clerkId,
      },
      { timeout: PORTRAIT_REQUEST_TIMEOUT_MS, maxRetries: 1 },
    );
    const portrait = result.data?.[0]?.b64_json;
    if (!portrait) throw new AuraPortraitError("invalid-response", true);
    return portrait;
  } catch (error) {
    throw classifyProviderError(error);
  }
}
