import "server-only";

import { resolveAuraPortraitModel } from "@/lib/aura-portrait-config";
import { env } from "@/lib/env";
import { getOpenAI } from "@/lib/openai";
import { MAX_PHOTO_BYTES } from "@/lib/validations";

const PORTRAIT_DOWNLOAD_TIMEOUT_MS = 10_000;
// A composited try-on runs slower than a bare portrait — the map's reference is
// latency up to ~2 min — so this per-attempt cap gives that headroom rather than
// aborting a legitimate generation. (The portrait path's 75s would be too tight.)
const TRY_ON_REQUEST_TIMEOUT_MS = 150_000;

const AURA_TRY_ON_PROMPT = `
Create one polished, photorealistic try-on look.

Image 1 is the subject: their fixed AURA portrait. Preserve that subject's
likeness, face, hairstyle, skin tone, body proportions, and pose exactly — do
not alter, restyle, or replace the person. The remaining images are garments.
Render those garment(s) worn together on the subject, replacing whatever they
were wearing, matching each garment's shape, colour, pattern, and material.

Keep the clean warm-neutral studio backdrop and soft editorial lighting. Return
a single image of the one subject wearing the supplied garment(s). No text,
logos, watermarks, extra people, mannequins, flat-lays, or collage treatment.
`;

export type AuraTryOnFailureKind =
  | "refused"
  | "timeout"
  | "transient"
  | "invalid-response"
  // Net-new to try-on: the untrusted client upload fails MIME/size/decode
  // validation at the boundary. Non-retryable with the same file — unlike the
  // portrait route, whose references are already-validated saved URLs.
  | "invalid-garment";

/** A stable, provider-agnostic error contract for the try-on route. */
export class AuraTryOnError extends Error {
  constructor(
    readonly kind: AuraTryOnFailureKind,
    readonly retryable: boolean,
  ) {
    super(kind);
    this.name = "AuraTryOnError";
  }
}

type TryOnRequest = {
  clerkId: string;
  portraitUrl: string;
  /** One-or-more garment images as validated base64 data URIs. */
  garments: string[];
};

function isErrorRecord(error: unknown): error is Record<string, unknown> {
  return typeof error === "object" && error !== null;
}

function classifyProviderError(error: unknown): AuraTryOnError {
  if (error instanceof AuraTryOnError) return error;

  const name = error instanceof Error ? error.name : undefined;
  if (name === "AbortError" || name === "TimeoutError") {
    return new AuraTryOnError("timeout", true);
  }

  const record = isErrorRecord(error) ? error : undefined;
  const code = record?.code;
  const status = record?.status;
  if (
    code === "moderation_blocked" ||
    code === "image_generation_user_error" ||
    (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429)
  ) {
    return new AuraTryOnError("refused", false);
  }

  if (status === 408) return new AuraTryOnError("timeout", true);
  return new AuraTryOnError("transient", true);
}

async function portraitFile(url: string): Promise<File> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(PORTRAIT_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new AuraTryOnError("transient", true);
  }

  return new File([await response.arrayBuffer()], "aura-portrait.jpg", {
    type: response.headers.get("content-type") ?? "image/jpeg",
  });
}

const GARMENT_DATA_URI = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

/**
 * Decodes an untrusted garment data URI into a File, re-validating MIME, decode,
 * and size at this boundary. The Zod schema already checked the wire shape; here
 * we confirm the bytes actually decode and stay under the limit — anything else
 * is a non-retryable `invalid-garment`, not a provider failure.
 */
function garmentFile(dataUri: string, index: number): File {
  const match = GARMENT_DATA_URI.exec(dataUri);
  if (!match) throw new AuraTryOnError("invalid-garment", false);

  // The regex already fixed `mime` to one of the accepted photo types, so the
  // remaining boundary checks are decode + size, which the wire schema can't do.
  const [, mime, base64] = match;

  let decoded: Buffer;
  try {
    decoded = Buffer.from(base64, "base64");
  } catch {
    throw new AuraTryOnError("invalid-garment", false);
  }
  if (decoded.byteLength === 0 || decoded.byteLength > MAX_PHOTO_BYTES) {
    throw new AuraTryOnError("invalid-garment", false);
  }

  // Copy into a fresh ArrayBuffer so the File is backed by plain (non-shared)
  // memory the DOM/File typings accept.
  const bytes = new ArrayBuffer(decoded.byteLength);
  new Uint8Array(bytes).set(decoded);
  const extension = mime.split("/")[1];
  return new File([bytes], `aura-garment-${index}.${extension}`, { type: mime });
}

/**
 * Composites the fixed AURA portrait wearing the supplied garment(s) into one
 * ephemeral look and returns the raw base64 JPEG. Intentionally OpenAI-specific
 * and mirrors `generateAuraPortrait`: text-provider selection has no effect on
 * the image model or its credentials, and no shared abstraction is extracted.
 */
export async function generateAuraTryOn({
  clerkId,
  portraitUrl,
  garments,
}: TryOnRequest): Promise<string> {
  try {
    // Decode garments first: a bad upload is non-retryable and must not cost the
    // slow portrait download or a provider round-trip.
    const garmentFiles = garments.map((garment, i) => garmentFile(garment, i));
    const portrait = await portraitFile(portraitUrl);
    const result = await getOpenAI().images.edit(
      {
        image: [portrait, ...garmentFiles],
        model: resolveAuraPortraitModel(env),
        prompt: AURA_TRY_ON_PROMPT,
        n: 1,
        size: "1024x1536",
        quality: "medium",
        output_format: "jpeg",
        background: "opaque",
        user: clerkId,
      },
      { timeout: TRY_ON_REQUEST_TIMEOUT_MS, maxRetries: 1 },
    );
    const look = result.data?.[0]?.b64_json;
    if (!look) throw new AuraTryOnError("invalid-response", true);
    return look;
  } catch (error) {
    throw classifyProviderError(error);
  }
}
