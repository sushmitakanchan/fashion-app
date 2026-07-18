import OpenAI from "openai";

let client: OpenAI | undefined;

/**
 * Lazily construct the OpenAI client. Using a getter (instead of a top-level
 * `new OpenAI()`) means importing this module never throws during build when
 * the API key is absent — the key is only required when a request is served.
 */
export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to your .env file.");
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

/** Default chat model — override with the OPENAI_MODEL env var. */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** Read-only credential and model-availability probe for the healthcheck. */
export async function probeOpenAI(model = OPENAI_MODEL): Promise<void> {
  await getOpenAI().models.retrieve(model);
}
