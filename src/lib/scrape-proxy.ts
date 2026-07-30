import { z } from "zod";

/**
 * Optional scraping-proxy fallback for `POST /api/aura/scrape`.
 *
 * Some retailers (Myntra, behind Akamai) serve their real product HTML only to
 * non-datacenter IPs, so a direct fetch from Vercel's datacenter egress gets a
 * challenge/interstitial page instead of the product. When a direct fetch comes
 * back with nothing usable and the source opts in, the route retries the SAME
 * allowlisted URL through one of these providers — a residential/rotating egress
 * that returns the page's raw HTML — and re-runs the unchanged extractor on it.
 *
 * Blank `SCRAPE_PROXY_API_KEY` = disabled (the route only fetches directly).
 *
 * Kept free of `@/lib/env` and `server-only` imports so it stays a pure, testable
 * core: callers pass the environment in, exactly like `@/lib/ai/provider`.
 */
export const SCRAPE_PROXY_PROVIDERS = [
  "scrapingant",
  "scraperapi",
  "scrapingbee",
] as const;

export type ScrapeProxyProvider = (typeof SCRAPE_PROXY_PROVIDERS)[number];

/**
 * Selection is optional; a bare API key means this provider. Defaults to
 * ScrapingAnt for its ongoing free tier (10k credits/month, no card) — the
 * cheapest way to give the fallback a residential egress.
 */
export const DEFAULT_SCRAPE_PROXY_PROVIDER: ScrapeProxyProvider = "scrapingant";

/** Validates the `SCRAPE_PROXY_PROVIDER` env var. */
export const scrapeProxyProviderSchema = z.enum(SCRAPE_PROXY_PROVIDERS);

/** The credential whose presence enables the proxy — the healthcheck reads this. */
export const SCRAPE_PROXY_API_KEY_ENV = "SCRAPE_PROXY_API_KEY";

export type ScrapeProxyConfig = {
  provider: ScrapeProxyProvider;
  apiKey: string;
  /** ISO country code for the egress IP (e.g. "in" for Myntra). Optional. */
  country?: string;
};

/**
 * Read the proxy config out of an environment, or null when disabled.
 *
 * Disabled is the default: no API key means the route never leaves the direct
 * path. An unrecognised `SCRAPE_PROXY_PROVIDER` falls back to the default rather
 * than throwing — the route degrades to direct-only, and the healthcheck probe
 * is where a genuine misconfiguration is surfaced loudly.
 */
export function readScrapeProxy(
  env: Record<string, string | undefined>,
): ScrapeProxyConfig | null {
  const apiKey = env[SCRAPE_PROXY_API_KEY_ENV]?.trim();
  if (!apiKey) return null;

  const parsed = scrapeProxyProviderSchema.safeParse(env.SCRAPE_PROXY_PROVIDER?.trim());
  const provider = parsed.success ? parsed.data : DEFAULT_SCRAPE_PROXY_PROVIDER;

  return { provider, apiKey, country: env.SCRAPE_PROXY_COUNTRY?.trim() || undefined };
}

/**
 * Build the provider request that returns `target`'s raw HTML. Each provider is
 * a transparent proxy: GET this URL, read the body, and it is the page's HTML —
 * so the route's existing extractor consumes it with no special-casing.
 *
 * Two knobs matter for beating Akamai (Myntra):
 *   - residential proxies — the *whole point*. The provider default is
 *     datacenter, which Akamai blocks exactly like Vercel's own IP, so every
 *     provider is asked for its residential pool explicitly.
 *   - no JS rendering — Myntra server-renders its JSON-LD, so we need the
 *     proxy's IP, not a headless browser. That keeps each request on the cheap,
 *     fast tier and well inside the function's time budget.
 */
export function scrapeProxyRequestUrl(
  config: ScrapeProxyConfig,
  target: string,
  country = config.country,
): string {
  switch (config.provider) {
    case "scrapingant": {
      const url = new URL("https://api.scrapingant.com/v2/general");
      url.searchParams.set("url", target);
      url.searchParams.set("x-api-key", config.apiKey);
      url.searchParams.set("proxy_type", "residential");
      url.searchParams.set("browser", "false");
      if (country) url.searchParams.set("proxy_country", country);
      return url.toString();
    }
    case "scrapingbee": {
      const url = new URL("https://app.scrapingbee.com/api/v1/");
      url.searchParams.set("api_key", config.apiKey);
      url.searchParams.set("url", target);
      url.searchParams.set("render_js", "false");
      url.searchParams.set("premium_proxy", "true");
      if (country) url.searchParams.set("country_code", country);
      return url.toString();
    }
    case "scraperapi":
    default: {
      const url = new URL("https://api.scraperapi.com/");
      url.searchParams.set("api_key", config.apiKey);
      url.searchParams.set("url", target);
      url.searchParams.set("premium", "true");
      if (country) url.searchParams.set("country_code", country);
      return url.toString();
    }
  }
}

/**
 * Fetch `target` through the proxy, returning its HTML, or null on any failure
 * (non-OK, transport error, timeout). Null means "the fallback recovered
 * nothing" — the caller then reports the same failure it would have without a
 * proxy, so a broken or exhausted proxy never turns a scrape into a 500.
 */
export async function fetchViaProxy(
  target: string,
  config: ScrapeProxyConfig,
  { country, signal }: { country?: string; signal: AbortSignal },
): Promise<string | null> {
  try {
    const response = await fetch(scrapeProxyRequestUrl(config, target, country), {
      signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
