import { z } from "zod";

/**
 * Text-generation providers the app can talk to. Kept free of SDK imports so
 * this module stays a pure, testable core — the adapters live in `./index.ts`.
 */
export const AI_PROVIDERS = ["openai", "anthropic"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Selection is optional everywhere; omitting it means OpenAI. */
export const DEFAULT_AI_PROVIDER: AiProvider = "openai";

/** For validating a provider that arrives over the wire. */
export const aiProviderSchema = z.enum(AI_PROVIDERS);

/** The env var each provider's credentials come from, for error messages. */
export const PROVIDER_API_KEY_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

/** Which providers currently hold credentials. */
export type ProviderCredentials = Record<AiProvider, boolean>;

/**
 * Thrown when the *selected* provider has no credentials. Distinct from an
 * upstream API failure so callers can tell "you misconfigured this" apart from
 * "the model call failed".
 */
export class AiProviderConfigError extends Error {
  readonly provider: AiProvider;

  constructor(provider: AiProvider) {
    super(
      `The "${provider}" AI provider is selected but ${PROVIDER_API_KEY_ENV[provider]} is not set. ` +
        `Add it to your .env file — text generation never falls back to another provider.`,
    );
    this.name = "AiProviderConfigError";
    this.provider = provider;
  }
}

/**
 * Resolve which provider serves a request. Deliberately has no fallback path:
 * an unconfigured selection is an error, never a quiet switch to whichever
 * provider happens to have a key — that would send prompts somewhere the caller
 * did not choose.
 */
export function resolveProvider(
  requested: AiProvider | undefined,
  credentials: ProviderCredentials,
): AiProvider {
  const provider = requested ?? DEFAULT_AI_PROVIDER;
  if (!credentials[provider]) {
    throw new AiProviderConfigError(provider);
  }
  return provider;
}
