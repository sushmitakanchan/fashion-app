import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { createProbes } from "./probes";

const originalFetch = globalThis.fetch;
let fetchStub: ReturnType<typeof mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;

beforeEach(() => {
  fetchStub = mock(async () =>
    new Response(JSON.stringify({ data: [{ id: "gpt-image-2" }] })),
  );
  globalThis.fetch = fetchStub as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AURA portrait image-capability probe", () => {
  it("performs a read-only model lookup with the OpenAI key", async () => {
    const detail = await createProbes({ OPENAI_API_KEY: "sk-test" }).auraPortrait();

    expect(detail).toContain("gpt-image-2");
    expect(fetchStub).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer sk-test" },
      }),
    );
  });

  it("makes an authorization failure actionable", async () => {
    fetchStub = mock(async () =>
      new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
        status: 401,
        statusText: "Unauthorized",
      }),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    await expect(
      createProbes({ OPENAI_API_KEY: "sk-test" }).auraPortrait(),
    ).rejects.toThrow("authorization failed");
  });

  it("names organization verification when OpenAI blocks image access", async () => {
    fetchStub = mock(async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "Your organization must be verified to use gpt-image-2.",
          },
        }),
        { status: 403, statusText: "Forbidden" },
      ),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    await expect(
      createProbes({ OPENAI_API_KEY: "sk-test" }).auraPortrait(),
    ).rejects.toThrow("organization verification is required");
  });

  it("fails when OpenAI does not list the configured portrait model", async () => {
    fetchStub = mock(async () => new Response(JSON.stringify({ data: [] })));
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    await expect(
      createProbes({ OPENAI_API_KEY: "sk-test" }).auraPortrait(),
    ).rejects.toThrow("does not list gpt-image-2 as available");
  });
});

describe("scrape-proxy probe", () => {
  it("hits the provider's read-only usage endpoint with the key", async () => {
    const detail = await createProbes({
      SCRAPE_PROXY_API_KEY: "sp-test",
    }).scrapeProxy();

    // Default provider is scraperapi; the probe should report it reachable.
    expect(detail).toContain("scraperapi");
    expect(fetchStub).toHaveBeenCalledWith(
      "https://api.scraperapi.com/account?api_key=sp-test",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("targets the selected provider's usage endpoint", async () => {
    await createProbes({
      SCRAPE_PROXY_API_KEY: "sp-test",
      SCRAPE_PROXY_PROVIDER: "scrapingbee",
    }).scrapeProxy();

    expect(fetchStub).toHaveBeenCalledWith(
      "https://app.scrapingbee.com/api/v1/usage?api_key=sp-test",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fails actionably when the key is rejected", async () => {
    fetchStub = mock(
      async () => new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    await expect(
      createProbes({ SCRAPE_PROXY_API_KEY: "bad" }).scrapeProxy(),
    ).rejects.toThrow("401");
  });
});
