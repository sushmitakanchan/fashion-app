import "server-only";

import { env } from "@/lib/env";

export const AURA_CONFIGURATION_UNAVAILABLE_MESSAGE =
  "AURA isn't configured to save profiles or generate portraits. Please try again later.";

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    (env.CLOUDINARY_CLOUD_NAME ?? env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
  );
}

export function isDatabaseConfigured(): boolean {
  return Boolean(env.DATABASE_URL);
}

/** Whether the OpenAI credential is present. Shared by portrait generation and
 *  the wardrobe vision-analysis boundary — both use the same `OPENAI_API_KEY`,
 *  independent of the provider-neutral text-generation choice. */
export function isOpenAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/** v1 portrait generation is OpenAI-only, independent of text-provider choice. */
export function isOpenAIImageConfigured(): boolean {
  return isOpenAIConfigured();
}

/**
 * Saving an AURA profile and generating its portrait require all three live
 * capabilities. Route handlers refuse requests when one is unavailable.
 */
export function isAuraLiveConfigured(): boolean {
  return (
    isCloudinaryConfigured() &&
    isDatabaseConfigured() &&
    isOpenAIImageConfigured()
  );
}
