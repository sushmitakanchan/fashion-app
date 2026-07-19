// PROTOTYPE — throwaway. Stubs POST /api/aura/scrape so the link-input UX can be
// exercised without a backend. Mirrors the real route contract (src/app/api/
// aura/scrape/route.ts): success -> { image, name, source }; errors ->
// { code, error, retryable }. Deterministic triggers so every state is
// reachable from the browser — type into a link:
//   "fail"    -> fetch-failed (retryable)
//   "noimage" -> no-image-found
//   "big"     -> image-too-large
//   any other pinterest.com / myntra.com URL -> success (~1.2s latency)
//   non-pinterest/myntra host -> unsupported-domain

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

/** Simulated scrape with ~1.2s latency so the transient "scraping…" tile is
 * clearly visible. Deterministic error triggers via the URL text. */
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
          error: "Couldn't reach that link. Please try again.",
          retryable: true,
        });
        return;
      }
      if (/noimage/i.test(trimmed)) {
        resolve({
          ok: false,
          code: "no-image-found",
          error: "We couldn't find an image on that page.",
          retryable: false,
        });
        return;
      }
      if (/big/i.test(trimmed)) {
        resolve({
          ok: false,
          code: "image-too-large",
          error: "That image is larger than 15 MiB.",
          retryable: false,
        });
        return;
      }
      scrapeCount += 1;
      // Garment-name policy (fixed in #70): scraped title when present, else
      // host + running index. Stub fakes a title for pinterest and a
      // host+index fallback for myntra so both read distinctly.
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
    }, 1200);
  });
}
