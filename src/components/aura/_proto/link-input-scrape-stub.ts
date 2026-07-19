// PROTOTYPE — throwaway. Stubs the (not-yet-built) POST /api/aura/scrape so the
// link-input UX variants can be exercised without a backend. Mirrors the
// adapter contract fixed in issue #69: success -> { image, name, source };
// errors -> { code, error, retryable }. Type "fail" / "noimage" / "big" into a
// link to trigger the corresponding error state; anything else on a
// pinterest.com or myntra.com host succeeds.

export type ScrapeSource = "pinterest" | "myntra";

export type ScrapeSuccess = {
  ok: true;
  image: string; // data URI (placeholder here)
  name: string;
  source: ScrapeSource;
};

export type ScrapeError = {
  ok: false;
  code:
    | "invalid-request"
    | "unsupported-domain"
    | "fetch-failed"
    | "no-image-found"
    | "wrong-type"
    | "image-too-large";
  error: string;
  retryable: boolean;
};

export type ScrapeResult = ScrapeSuccess | ScrapeError;

// A recognizable stand-in garment image so a "successful scrape" is visibly a
// real attachment. Different tint per source so the two look distinct.
function placeholderImage(source: ScrapeSource, label: string): string {
  const bg = source === "pinterest" ? "#e60023" : "#ff3f6c";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${bg}"/><rect x="70" y="55" width="100" height="130" rx="8" fill="rgba(255,255,255,0.9)"/><text x="120" y="215" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function detectSource(url: string): ScrapeSource | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "pinterest.com" || host.endsWith(".pinterest.com"))
      return "pinterest";
    if (host === "myntra.com" || host === "www.myntra.com") return "myntra";
    return null;
  } catch {
    return null;
  }
}

let scrapeCount = 0;

/** Simulated scrape with ~1.1s latency. Deterministic error triggers via the
 * URL text so every state is reachable from the browser. */
export function scrapeStub(url: string): Promise<ScrapeResult> {
  const trimmed = url.trim();
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!trimmed) {
        resolve({
          ok: false,
          code: "invalid-request",
          error: "Enter a link first.",
          retryable: false,
        });
        return;
      }
      const source = detectSource(trimmed);
      if (!source) {
        resolve({
          ok: false,
          code: "unsupported-domain",
          error: "Only Pinterest and Myntra links are supported.",
          retryable: false,
        });
        return;
      }
      if (/fail/i.test(trimmed)) {
        resolve({
          ok: false,
          code: "fetch-failed",
          error: "Couldn't reach that link. Try again.",
          retryable: true,
        });
        return;
      }
      if (/noimage/i.test(trimmed)) {
        resolve({
          ok: false,
          code: "no-image-found",
          error: "No garment image found on that link.",
          retryable: false,
        });
        return;
      }
      if (/big/i.test(trimmed)) {
        resolve({
          ok: false,
          code: "image-too-large",
          error: "That image is over 15 MB.",
          retryable: false,
        });
        return;
      }
      scrapeCount += 1;
      // Garment name policy under evaluation: scraped title when present, else
      // host + running index. The stub always fakes a title for pinterest and
      // falls back to host+index for myntra, so both policies are visible.
      const name =
        source === "pinterest"
          ? "Cropped linen jacket"
          : `myntra garment ${scrapeCount}`;
      resolve({
        ok: true,
        image: placeholderImage(source, source),
        name,
        source,
      });
    }, 1100);
  });
}
