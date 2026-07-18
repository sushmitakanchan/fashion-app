import "server-only";

import { ANTHROPIC_MODEL, getAnthropic } from "@/lib/anthropic";
import { env } from "@/lib/env";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";

import {
  resolveProvider,
  type AiProvider,
  type ProviderCredentials,
} from "./provider";

export {
  AI_PROVIDERS,
  AiProviderConfigError,
  aiProviderSchema,
  DEFAULT_AI_PROVIDER,
  PROVIDER_API_KEY_ENV,
  type AiProvider,
} from "./provider";

/** Anthropic requires an explicit output cap; OpenAI treats it as optional. */
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export type GenerateTextOptions = {
  prompt: string;
  /** Instructions that frame the request — the "system prompt". */
  system?: string;
  /** Omit to use {@link DEFAULT_AI_PROVIDER}. */
  provider?: AiProvider;
  /** Overrides the provider's configured default model. */
  model?: string;
  maxOutputTokens?: number;
};

export type GeneratedText = {
  text: string;
  provider: AiProvider;
  model: string;
};

function credentials(): ProviderCredentials {
  return {
    openai: Boolean(env.OPENAI_API_KEY),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
  };
}

/**
 * The app's single text-generation boundary. Application code asks for text and
 * names a provider (or doesn't) — it never touches an SDK directly, so swapping
 * or adding a provider is a change here rather than at every call site.
 *
 * Non-streaming by design: every consumer so far returns a whole reply in one
 * JSON response, and a streaming interface would leak transport concerns into
 * all of them. Add a sibling `streamText` if a caller ever needs it.
 */
export async function generateText({
  prompt,
  system,
  provider: requested,
  model,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
}: GenerateTextOptions): Promise<GeneratedText> {
  // Throws AiProviderConfigError when the selected provider has no key — never
  // silently reroutes the prompt to whichever provider happens to be set up.
  const provider = resolveProvider(requested, credentials());

  if (provider === "anthropic") {
    const resolvedModel = model ?? ANTHROPIC_MODEL;
    const message = await getAnthropic().messages.create({
      model: resolvedModel,
      max_tokens: maxOutputTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }],
    });
    // `content` is a union of block types; only text blocks carry a reply.
    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    return { text, provider, model: resolvedModel };
  }

  const resolvedModel = model ?? OPENAI_MODEL;
  const completion = await getOpenAI().chat.completions.create({
    model: resolvedModel,
    max_tokens: maxOutputTokens,
    messages: [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      { role: "user" as const, content: prompt },
    ],
  });
  return {
    text: completion.choices[0]?.message?.content ?? "",
    provider,
    model: resolvedModel,
  };
}
