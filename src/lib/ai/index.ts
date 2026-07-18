import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText as aiGenerateText, type LanguageModel } from "ai";

import { ANTHROPIC_MODEL } from "@/lib/anthropic";
import { env } from "@/lib/env";
import { OPENAI_MODEL } from "@/lib/openai";

import {
  readProviderCredentials,
  resolveProvider,
  type AiProvider,
} from "./provider";

export {
  AI_PROVIDERS,
  AiProviderConfigError,
  aiProviderSchema,
  DEFAULT_AI_PROVIDER,
  PROVIDER_API_KEY_ENV,
  type AiProvider,
} from "./provider";

/**
 * Each provider's model, resolved lazily. The AI SDK provider instances read
 * their own API key at request time, so referencing them can't throw on import.
 */
const MODELS: Record<AiProvider, () => LanguageModel> = {
  openai: () => openai(OPENAI_MODEL),
  anthropic: () => anthropic(ANTHROPIC_MODEL),
};

export type GenerateTextOptions = {
  /** Frames the request — the "system prompt". */
  instructions: string;
  prompt: string;
};

export type GeneratedText = {
  text: string;
  provider: AiProvider;
};

/**
 * The app's single text-generation boundary: instructions plus a prompt in,
 * reply text out. Feature code goes through here rather than touching a vendor
 * SDK, so which provider serves a request stays a deployment concern.
 *
 * Non-streaming by design, and deliberately narrow — streaming, tool calls,
 * images, and provider-specific request options are not part of this capability
 * (see CONTEXT.md, "Text generation"). Widen it when a caller actually needs to.
 */
export async function generateText({
  instructions,
  prompt,
}: GenerateTextOptions): Promise<GeneratedText> {
  // Throws AiProviderConfigError when the selected provider has no key — it
  // never silently reroutes the prompt to whichever provider is set up.
  const provider = resolveProvider(
    env.AI_PROVIDER,
    readProviderCredentials(process.env),
  );

  const { text } = await aiGenerateText({
    model: MODELS[provider](),
    instructions,
    prompt,
  });

  return { text, provider };
}
