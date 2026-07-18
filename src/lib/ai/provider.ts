import { z } from "zod";

/**
 * Providers that can serve text generation. Kept free of SDK and env imports so
 * this module stays a pure, testable core — `./index.ts` wires it to the world.
 */
export const AI_PROVIDERS = ["openai", "anthropic"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

/** AI provider selection is optional in every environment; omitted means this. */
export const DEFAULT_AI_PROVIDER: AiProvider = "openai";

/** Validates the `AI_PROVIDER` env var. */
export const aiProviderSchema = z.enum(AI_PROVIDERS);

/** The env var each provider's credentials come from, for error messages. */
export const PROVIDER_API_KEY_ENV: Record<AiProvider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

/** Which providers currently hold credentials. */
export type ProviderCredentials = Record<AiProvider, boolean>;

/**
 * Thrown when the selected provider has no credentials. Distinct from an
 * upstream API failure so callers can tell "this deployment is misconfigured"
 * apart from "the provider rejected our request".
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
 * Resolve which provider serves a request, given the configured selection
 * (`AI_PROVIDER`, possibly unset) and which providers hold credentials.
 *
 * Deliberately has no fallback path: an unconfigured selection is an error,
 * never a quiet switch to whichever provider happens to have a key. Each
 * provider is a separate credential and billing relationship, so falling back
 * would spend money at a vendor the operator did not choose.
 */
export function resolveProvider(
  configured: AiProvider | undefined,
  credentials: ProviderCredentials,
): AiProvider {
  const provider = configured ?? DEFAULT_AI_PROVIDER;
  if (!credentials[provider]) {
    throw new AiProviderConfigError(provider);
  }
  return provider;
}
