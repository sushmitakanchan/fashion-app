import { z } from "zod";

import { aiProviderSchema } from "@/lib/ai/provider";

/**
 * Centralized, type-safe environment access.
 *
 * Every var is optional so the app can boot during setup (e.g. Clerk keyless
 * mode with empty keys). Once your keys are in place, tighten any of these to
 * be required (drop `.optional()`) to fail fast on misconfiguration.
 *
 * Intended for server-side use — on the client only `NEXT_PUBLIC_*` values are
 * inlined by Next.js.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database (Neon Postgres)
  DATABASE_URL: z.string().optional(),

  // Clerk
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),

  // Which provider serves AI text generation. Omit for OpenAI.
  AI_PROVIDER: aiProviderSchema.optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  // Anthropic (optional)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  // Cloudinary
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
