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

/**
 * A live AURA submission both uploads reference photos (Cloudinary) and persists
 * the profile (Neon/Prisma), so both stacks must be configured. When either is
 * missing the journey falls back to a local preview — see {@link AuraMode}.
 */
export function isAuraLiveConfigured(): boolean {
  return isCloudinaryConfigured() && isDatabaseConfigured();
}

export function auraMode(): AuraMode {
  return isAuraLiveConfigured() ? "live" : "preview";
}
