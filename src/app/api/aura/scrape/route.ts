import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { ACCEPTED_PHOTO_TYPES, MAX_PHOTO_BYTES } from "@/lib/validations";

type Failure = {
  code: string;
  error: string;
  retryable: boolean;
};

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

/**
 * An honest identifier on every outbound request. The endpoint performs a single
 * straightforward fetch per hop — no browser spoofing or anti-bot evasion.
 */
export const SCRAPE_USER_AGENT =
  "AURA-TryOn/1.0 (+https://github.com/sushmitakanchan/fashion-app; link ingestion)";

// A hard per-hop ceiling on every outbound fetch. Without it a host that accepts
// the connection but never sends a response (some sites stall a non-browser
// user-agent rather than refusing it) leaves the request hanging on undici's
// multi-minute default header timeout — surfacing as a scrape that never ends.
// Fail fast and retryably instead.
const SCRAPE_TIMEOUT_MS = 12_000;

/** True for the `AbortSignal.timeout` rejection, so its copy can differ. */
function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

type Source = "pinterest" | "myntra";

type Extraction = { image: string | null; name: string | null };

type SourceRule = {
  source: Source;
  // Human-facing shop name, used in the "coming soon" copy.
  label: string;
  host: RegExp;
  path: RegExp;
  // The CDN host(s) an image reference from this source's page is allowed to
  // resolve to. The image URL comes from page-controlled markup (og:image /
  // JSON-LD), so pinning it to the source's known CDN is the SSRF backstop for
  // the second fetch hop — see the image-resolution guard in `POST`.
  imageHosts: readonly string[];
  extract: (html: string) => Extraction;
  // Recognised but not yet ingested: the route answers "coming soon" instead of
  // scraping. The rule's extractor is retained for the day it goes live —
  // Myntra blocks non-browser fetches today, so a plain server-side scrape
  // can't succeed yet, but the JSON-LD extraction stays wired and ready.
  comingSoon?: boolean;
};

// The allowlist is matched on the parsed URL's host + path only; the query
// string is ignored. https-only is enforced separately (see `matchSource`).
// Anything that fails to match a rule here never reaches a network call.
const SOURCE_RULES: SourceRule[] = [
  {
    source: "pinterest",
    label: "Pinterest",
    // `(*.)pinterest.com` — the .com apex or any subdomain, but never a ccTLD
    // such as pinterest.co.uk (deliberately out of scope).
    host: /^(?:[a-z0-9-]+\.)*pinterest\.com$/i,
    // `/pin/(?:<slug>--)?<id>/` — a numeric pin id with an optional slug prefix.
    path: /^\/pin\/(?:[^/]+--)?\d+\/?$/,
    // Pinterest serves pin images (og:image) from i.pinimg.com.
    imageHosts: ["i.pinimg.com"],
    extract: (html) => ({
      image: readMeta(html, "og:image"),
      name: readMeta(html, "og:title"),
    }),
  },
  {
    source: "myntra",
    label: "Myntra",
    // `(www.)myntra.com`.
    host: /^(?:www\.)?myntra\.com$/i,
    // `.../<styleId>/buy` — a numeric style id followed by the `buy` segment.
    path: /^\/(?:[^/]+\/)*\d+\/buy\/?$/,
    // Myntra serves full-resolution product images from assets.myntassets.com.
    imageHosts: ["assets.myntassets.com"],
    extract: (html) => {
      const product = readJsonLdProduct(html);
      // Myntra's og:image is only a 200×200 thumbnail, so the full-resolution
      // JSON-LD image is the only image source. The title, however, may fall
      // back to og:title when the JSON-LD carries no name.
      return {
        image: product.image,
        name: product.name ?? readMeta(html, "og:title"),
      };
    },
    comingSoon: true,
  },
];

// Popular fashion shops we recognise by host so a pasted link gets a named
// "coming soon" reply rather than a flat "unsupported" — the demand signal
// users are pasting. Host-only (no product-page rule yet); most expose a
// JSON-LD Product, so `readJsonLdProduct` is the extractor they'll reuse when
// each graduates to a full SOURCE_RULE.
const COMING_SOON_SHOPS: { host: RegExp; label: string }[] = [
  { host: /^(?:www\.)?ajio\.com$/i, label: "Ajio" },
  { host: /^(?:www\.)?nykaafashion\.com$/i, label: "Nykaa Fashion" },
  { host: /^(?:www\.)?flipkart\.com$/i, label: "Flipkart" },
  { host: /^(?:www\.)?tatacliq\.com$/i, label: "Tata CLiQ" },
  { host: /^(?:www\.)?zara\.com$/i, label: "Zara" },
  { host: /^(?:www2?\.)?hm\.com$/i, label: "H&M" },
  { host: /^(?:www\.)?asos\.com$/i, label: "ASOS" },
];

// Active scraping only — `comingSoon` rules are recognised (below) but never
// fetched, so they can't reach a network call through this path.
function matchSource(url: URL): SourceRule | null {
  if (url.protocol !== "https:") return null;
  return (
    SOURCE_RULES.find(
      (rule) =>
        !rule.comingSoon &&
        rule.host.test(url.hostname) &&
        rule.path.test(url.pathname),
    ) ?? null
  );
}

// The shop name to name in a "coming soon" reply, or null if unrecognised.
// Matched on host alone so even an off-shape URL on the domain is caught.
function comingSoonLabel(url: URL): string | null {
  const gatedRule = SOURCE_RULES.find(
    (rule) => rule.comingSoon && rule.host.test(url.hostname),
  );
  if (gatedRule) return gatedRule.label;
  return COMING_SOON_SHOPS.find((shop) => shop.host.test(url.hostname))?.label ??
    null;
}

const scrapeRequestSchema = z.object({ url: z.string().min(1) });

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, {
      code: "unauthorized",
      error: "Unauthorized",
      retryable: false,
    });
  }

  const clerkUser = await currentUser();
  const admission = clerkUser && admitGoogleAuraIdentity(clerkUser);
  if (!admission?.ok) {
    return failure(403, {
      code: "identity-refused",
      error: admission?.error ?? "We couldn't verify your Google identity.",
      retryable: false,
    });
  }

  // Scraping touches no OpenAI/Cloudinary/Prisma capability, so — unlike the
  // try-on route — there is deliberately no configuration (503) gate here.

  const parsed = scrapeRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return failure(400, {
      code: "invalid-request",
      error: "Provide a Pinterest link to scrape.",
      retryable: false,
    });
  }

  let target: URL;
  try {
    target = new URL(parsed.data.url);
  } catch {
    return failure(400, {
      code: "invalid-request",
      error: "That doesn't look like a valid link.",
      retryable: false,
    });
  }

  // A recognised-but-not-yet-scraped shop gets a named "coming soon" — checked
  // before `matchSource` so any URL on the domain is answered, not just
  // well-formed product paths.
  const soon = comingSoonLabel(target);
  if (soon) {
    return failure(422, {
      code: "coming-soon",
      error: `${soon} links are coming soon — paste a Pinterest pin for now.`,
      retryable: false,
    });
  }

  const rule = matchSource(target);
  if (!rule) {
    return failure(400, {
      code: "unsupported-domain",
      error: "Only Pinterest pins are supported right now — more shops soon.",
      retryable: false,
    });
  }

  // Hop 1: the source page. A transport error or non-OK response is retryable.
  let html: string;
  try {
    const pageResponse = await fetch(target.href, {
      headers: { "user-agent": SCRAPE_USER_AGENT },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });
    if (!pageResponse.ok) {
      return fetchFailed("We couldn't reach that link. Please try again.");
    }
    html = await pageResponse.text();
  } catch (error) {
    return fetchFailed(
      isTimeout(error)
        ? "That link took too long to respond. Please try again."
        : "We couldn't reach that link. Please try again.",
    );
  }

  const extracted = rule.extract(html);
  let imageHref: string | null = null;
  if (extracted.image) {
    try {
      // Resolve against the page URL so protocol-relative (`//host/...`) and
      // relative image references become absolute.
      const resolved = new URL(extracted.image, target);
      // The image reference is page-controlled markup (og:image / JSON-LD), so a
      // crafted value could otherwise steer this second fetch at an arbitrary
      // target. Two guards keep it on rails before any network call:
      //   1. https-only — rejects file://, http:// metadata endpoints, gopher://
      //      and every other non-https scheme outright.
      //   2. a per-source CDN host allowlist — the image must live on the known
      //      CDN for the matched source. This is the SSRF backstop: an https ref
      //      aimed at a private, loopback, or link-local address
      //      (https://169.254.169.254/, https://127.0.0.1, https://[::1], an
      //      internal hostname, …) is never one of those public CDN hosts, so it
      //      is refused here rather than fetched. Because the allowlisted hosts
      //      sit on domains an attacker doesn't control, their DNS can't be
      //      repointed at an internal IP — the check is DNS-rebinding-proof
      //      without our resolving or pinning an address ourselves.
      // `URL.hostname` strips any userinfo and port, so a masking trick like
      // `https://i.pinimg.com@169.254.169.254/` resolves to the 169.254 host and
      // is correctly rejected.
      if (
        resolved.protocol === "https:" &&
        rule.imageHosts.includes(resolved.hostname)
      ) {
        imageHref = resolved.href;
      }
    } catch {
      imageHref = null;
    }
  }
  if (!imageHref) {
    return noImageFound("We couldn't find an image on that page.");
  }

  // Hop 2: the image itself.
  let imageResponse: Response;
  try {
    imageResponse = await fetch(imageHref, {
      headers: { "user-agent": SCRAPE_USER_AGENT },
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    });
    if (!imageResponse.ok) {
      return fetchFailed("We couldn't download that image. Please try again.");
    }
  } catch (error) {
    return fetchFailed(
      isTimeout(error)
        ? "That image took too long to download. Please try again."
        : "We couldn't download that image. Please try again.",
    );
  }

  // DoS guard: reject on the advertised Content-Length *before* the body is
  // read, so an oversized image is never downloaded in full.
  const declaredLength = Number(imageResponse.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PHOTO_BYTES) {
    return imageTooLarge();
  }

  const mimeType = (imageResponse.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ACCEPTED_PHOTO_TYPES.includes(mimeType)) {
    return failure(422, {
      code: "wrong-type",
      error: "That image must be a JPEG, PNG, or WebP.",
      retryable: false,
    });
  }

  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  // An empty body encodes to `data:<mime>;base64,`, which `photoDataUri`
  // rejects (its payload must be non-empty). Refuse it here so the success
  // shape's "satisfies photoDataUri" guarantee always holds.
  if (bytes.byteLength === 0) {
    return noImageFound("That link's image was empty.");
  }
  // Belt-and-suspenders for a missing or dishonest Content-Length: the decoded
  // byte count is the same size rule `photoDataUri` enforces on an upload.
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    return imageTooLarge();
  }

  // Ephemeral: the image is returned inline as a base64 data URI. Because it was
  // validated against ACCEPTED_PHOTO_TYPES + MAX_PHOTO_BYTES, it satisfies
  // `photoDataUri`, so the unchanged try-on path consumes it verbatim. Nothing
  // is written to Cloudinary or the database on any path.
  return NextResponse.json(
    {
      image: `data:${mimeType};base64,${bytes.toString("base64")}`,
      name: extracted.name?.trim() || target.host,
      source: rule.source,
    },
    { status: 200 },
  );
}

function fetchFailed(error: string) {
  return failure(502, { code: "fetch-failed", error, retryable: true });
}

function noImageFound(error: string) {
  return failure(422, { code: "no-image-found", error, retryable: false });
}

function imageTooLarge() {
  return failure(422, {
    code: "image-too-large",
    error: "That image is larger than 15 MiB.",
    retryable: false,
  });
}

// --- Extraction helpers (exercised through the route, never mocked) ---------

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|#x27);/gi,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

/** Reads the `content` of the first `<meta>` whose property/name matches. */
function readMeta(html: string, property: string): string | null {
  const wanted = property.toLowerCase();
  const metaTags = html.match(/<meta\b[^>]*>/gi);
  if (!metaTags) return null;
  for (const tag of metaTags) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== wanted) continue;
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content);
  }
  return null;
}

type JsonLdProduct = { image?: unknown; name?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasType(type: unknown, wanted: string): boolean {
  const matches = (t: unknown) =>
    typeof t === "string" && t.toLowerCase() === wanted.toLowerCase();
  return Array.isArray(type) ? type.some(matches) : matches(type);
}

/** The first usable image URL from a JSON-LD `image` value. */
function firstImage(image: unknown): string | null {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    for (const entry of image) {
      const resolved = firstImage(entry);
      if (resolved) return resolved;
    }
    return null;
  }
  if (isRecord(image) && typeof image.url === "string") return image.url;
  return null;
}

/** Finds the first `@type: "Product"` node in a JSON-LD document. */
function findProduct(data: unknown): JsonLdProduct | null {
  const nodes: unknown[] = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data["@graph"])
      ? (data["@graph"] as unknown[])
      : [data];
  for (const node of nodes) {
    if (isRecord(node) && hasType(node["@type"], "Product")) {
      return node as JsonLdProduct;
    }
  }
  return null;
}

function readJsonLdProduct(html: string): Extraction {
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const product = findProduct(data);
    if (product) {
      return {
        image: firstImage(product.image),
        name: typeof product.name === "string" ? product.name : null,
      };
    }
  }
  return { image: null, name: null };
}
