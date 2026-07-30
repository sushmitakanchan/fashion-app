import { afterEach, describe, expect, it } from "bun:test";

import {
  fetchViaProxy,
  readScrapeProxy,
  scrapeProxyRequestUrl,
  type ScrapeProxyConfig,
} from "./scrape-proxy";

describe("readScrapeProxy", () => {
  it("is disabled (null) when no API key is set", () => {
    expect(readScrapeProxy({})).toBeNull();
    expect(readScrapeProxy({ SCRAPE_PROXY_API_KEY: "   " })).toBeNull();
    // A provider with no key is still disabled — the key is what enables it.
    expect(readScrapeProxy({ SCRAPE_PROXY_PROVIDER: "scrapingbee" })).toBeNull();
  });

  it("defaults the provider to scraperapi when only a key is set", () => {
    expect(readScrapeProxy({ SCRAPE_PROXY_API_KEY: "k" })).toEqual({
      provider: "scraperapi",
      apiKey: "k",
      country: undefined,
    });
  });

  it("honours a valid provider override and country", () => {
    expect(
      readScrapeProxy({
        SCRAPE_PROXY_API_KEY: "k",
        SCRAPE_PROXY_PROVIDER: "scrapingbee",
        SCRAPE_PROXY_COUNTRY: "in",
      }),
    ).toEqual({ provider: "scrapingbee", apiKey: "k", country: "in" });
  });

  it("falls back to the default provider on an unrecognised value", () => {
    expect(
      readScrapeProxy({ SCRAPE_PROXY_API_KEY: "k", SCRAPE_PROXY_PROVIDER: "nope" })
        ?.provider,
    ).toBe("scraperapi");
  });
});

describe("scrapeProxyRequestUrl", () => {
  const key = "secret-key";

  it("builds a scraperapi request carrying the target and geo", () => {
    const config: ScrapeProxyConfig = { provider: "scraperapi", apiKey: key, country: "in" };
    const url = new URL(
      scrapeProxyRequestUrl(config, "https://www.myntra.com/x/123/buy"),
    );

    expect(url.origin + url.pathname).toBe("https://api.scraperapi.com/");
    expect(url.searchParams.get("api_key")).toBe(key);
    expect(url.searchParams.get("url")).toBe("https://www.myntra.com/x/123/buy");
    expect(url.searchParams.get("country_code")).toBe("in");
  });

  it("builds a scrapingbee request with JS rendering off", () => {
    const config: ScrapeProxyConfig = { provider: "scrapingbee", apiKey: key };
    const url = new URL(scrapeProxyRequestUrl(config, "https://shop.example/p/1"));

    expect(url.origin + url.pathname).toBe("https://app.scrapingbee.com/api/v1/");
    expect(url.searchParams.get("render_js")).toBe("false");
    expect(url.searchParams.get("url")).toBe("https://shop.example/p/1");
  });

  it("lets an explicit country override the config default", () => {
    const config: ScrapeProxyConfig = { provider: "scraperapi", apiKey: key, country: "us" };
    const url = new URL(scrapeProxyRequestUrl(config, "https://x.example/p", "in"));
    expect(url.searchParams.get("country_code")).toBe("in");
  });
});

describe("fetchViaProxy", () => {
  const realFetch = globalThis.fetch;
  const config: ScrapeProxyConfig = { provider: "scraperapi", apiKey: "k" };

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns the proxied HTML on a 200", async () => {
    globalThis.fetch = (async () => new Response("<html>ok</html>")) as unknown as typeof fetch;
    const html = await fetchViaProxy("https://x.example/p", config, {
      signal: AbortSignal.timeout(1000),
    });
    expect(html).toBe("<html>ok</html>");
  });

  it("returns null on a non-OK proxy response", async () => {
    globalThis.fetch = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const html = await fetchViaProxy("https://x.example/p", config, {
      signal: AbortSignal.timeout(1000),
    });
    expect(html).toBeNull();
  });

  it("returns null (never throws) on a transport error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    const html = await fetchViaProxy("https://x.example/p", config, {
      signal: AbortSignal.timeout(1000),
    });
    expect(html).toBeNull();
  });
});
