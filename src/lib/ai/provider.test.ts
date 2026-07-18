import { describe, expect, it } from "bun:test";

import {
  AiProviderConfigError,
  PROVIDER_API_KEY_ENV,
  resolveProvider,
} from "./provider";

const both = { openai: true, anthropic: true };
const neither = { openai: false, anthropic: false };

describe("resolveProvider", () => {
  it("defaults to OpenAI when no provider is selected", () => {
    expect(resolveProvider(undefined, both)).toBe("openai");
  });

  it("honours an explicit selection", () => {
    expect(resolveProvider("anthropic", both)).toBe("anthropic");
    expect(resolveProvider("openai", both)).toBe("openai");
  });

  it("never falls back to a configured provider when the selected one is not", () => {
    // Anthropic is the only provider with credentials, but the default
    // selection is still OpenAI — resolution must fail, not silently switch.
    expect(() =>
      resolveProvider(undefined, { openai: false, anthropic: true }),
    ).toThrow(AiProviderConfigError);

    expect(() =>
      resolveProvider("anthropic", { openai: true, anthropic: false }),
    ).toThrow(AiProviderConfigError);
  });

  it("names the missing env var so the failure is actionable", () => {
    expect(() => resolveProvider("openai", neither)).toThrow(
      PROVIDER_API_KEY_ENV.openai,
    );
    expect(() => resolveProvider("anthropic", neither)).toThrow(
      PROVIDER_API_KEY_ENV.anthropic,
    );
  });
});
