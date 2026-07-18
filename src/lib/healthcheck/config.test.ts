import { describe, expect, it } from "bun:test";

import { classifyServices, SERVICE_LABELS } from "./config";

/** Every optional integration left unconfigured — the credential-free setup. */
const blank: Record<string, string | undefined> = {};

const fullyConfigured: Record<string, string | undefined> = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
  DATABASE_URL: "postgres://x",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  OPENAI_API_KEY: "sk-x",
};

function statusOf(
  env: Record<string, string | undefined>,
  service: keyof typeof SERVICE_LABELS,
) {
  return classifyServices(env).find((s) => s.service === service)!;
}

describe("classifyServices", () => {
  it("reports every service as absent when nothing is configured", () => {
    for (const config of classifyServices(blank)) {
      expect(config.status).toBe("absent");
    }
  });

  it("reports every service as configured when all credentials are present", () => {
    for (const config of classifyServices(fullyConfigured)) {
      expect(config.status).toBe("configured");
    }
  });

  it("names the missing variables when a service is partially configured", () => {
    const clerk = statusOf(
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" },
      "clerk",
    );

    expect(clerk.status).toBe("incomplete");
    expect(clerk.status === "incomplete" && clerk.missing).toEqual([
      "CLERK_SECRET_KEY",
    ]);
  });

  it("accepts either Cloudinary cloud-name variable", () => {
    const withPublicName = statusOf(
      {
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "key",
        CLOUDINARY_API_SECRET: "secret",
      },
      "cloudinary",
    );

    expect(withPublicName.status).toBe("configured");
  });

  it("treats a selected AI provider as configured only with its own key", () => {
    const configured = statusOf(
      { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant" },
      "ai",
    );
    expect(configured.status).toBe("configured");
    expect(configured.status === "configured" && configured.detail).toBe(
      "anthropic",
    );
  });

  it("rejects an AI selection whose key is missing rather than falling back", () => {
    // Anthropic holds the only key, but OpenAI is the default selection.
    const ai = statusOf({ ANTHROPIC_API_KEY: "sk-ant" }, "ai");

    expect(ai.status).toBe("incomplete");
    expect(ai.status === "incomplete" && ai.missing).toEqual(["OPENAI_API_KEY"]);
  });

  it("flags an explicit AI selection with no key at all as incomplete", () => {
    const ai = statusOf({ AI_PROVIDER: "anthropic" }, "ai");

    expect(ai.status).toBe("incomplete");
    expect(ai.status === "incomplete" && ai.missing).toEqual([
      "ANTHROPIC_API_KEY",
    ]);
  });

  it("rejects an unrecognized AI_PROVIDER value", () => {
    const ai = statusOf({ AI_PROVIDER: "gemini", OPENAI_API_KEY: "sk-x" }, "ai");

    expect(ai.status).toBe("incomplete");
    expect(ai.status === "incomplete" && ai.missing).toEqual(["AI_PROVIDER"]);
  });

  it("ignores blank values, which are how keyless mode is expressed", () => {
    const clerk = statusOf(
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "", CLERK_SECRET_KEY: "  " },
      "clerk",
    );

    expect(clerk.status).toBe("absent");
  });
});
