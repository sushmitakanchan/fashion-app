import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/**
 * Lazily construct the Anthropic client (optional provider). Import stays safe
 * even without a key; the key is only required at call time.
 */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Default model — override with the ANTHROPIC_MODEL env var. */
export const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

/** Read-only credential and model-availability probe for the healthcheck. */
export async function probeAnthropic(model = ANTHROPIC_MODEL): Promise<void> {
  await getAnthropic().models.retrieve(model);
}
