import "server-only";

import type { AuraMode } from "@/lib/aura";
import { env } from "@/lib/env";

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

/** v1 portrait generation is OpenAI-only, independent of text-provider choice. */
export function isOpenAIImageConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY);
}

/**
 * A live AURA journey saves reference photos, persists a profile, and can then
 * generate an OpenAI portrait. All three capabilities must be configured;
 * otherwise this deployment presents an explicitly local preview.
 */
export function isAuraLiveConfigured(): boolean {
  return (
    isCloudinaryConfigured() &&
    isDatabaseConfigured() &&
    isOpenAIImageConfigured()
  );
}

export function auraMode(): AuraMode {
  return isAuraLiveConfigured() ? "live" : "preview";
}
