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

type Source = "pinterest" | "myntra";

type Extraction = { image: string | null; name: string | null };

type SourceRule = {
  source: Source;
  host: RegExp;
  path: RegExp;
  extract: (html: string) => Extraction;
};

// The allowlist is matched on the parsed URL's host + path only; the query
// string is ignored. https-only is enforced separately (see `matchSource`).
// Anything that fails to match a rule here never reaches a network call.
const SOURCE_RULES: SourceRule[] = [
  {
    source: "pinterest",
    // `(*.)pinterest.com` — the .com apex or any subdomain, but never a ccTLD
    // such as pinterest.co.uk (deliberately out of scope).
    host: /^(?:[a-z0-9-]+\.)*pinterest\.com$/i,
    // `/pin/(?:<slug>--)?<id>/` — a numeric pin id with an optional slug prefix.
    path: /^\/pin\/(?:[^/]+--)?\d+\/?$/,
    extract: (html) => ({
      image: readMeta(html, "og:image"),
      name: readMeta(html, "og:title"),
    }),
  },
  {
    source: "myntra",
    // `(www.)myntra.com`.
    host: /^(?:www\.)?myntra\.com$/i,
    // `.../<styleId>/buy` — a numeric style id followed by the `buy` segment.
    path: /^\/(?:[^/]+\/)*\d+\/buy\/?$/,
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
  },
];

function matchSource(url: URL): SourceRule | null {
  if (url.protocol !== "https:") return null;
  return (
    SOURCE_RULES.find(
      (rule) => rule.host.test(url.hostname) && rule.path.test(url.pathname),
    ) ?? null
  );
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
      error: "Provide a Pinterest or Myntra link to scrape.",
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

  const rule = matchSource(target);
  if (!rule) {
    return failure(400, {
      code: "unsupported-domain",
      error: "Only Pinterest pins and Myntra product links are supported.",
      retryable: false,
    });
  }

  // Hop 1: the source page. A transport error or non-OK response is retryable.
  let html: string;
  try {
    const pageResponse = await fetch(target.href, {
      headers: { "user-agent": SCRAPE_USER_AGENT },
    });
    if (!pageResponse.ok) {
      return fetchFailed("We couldn't reach that link. Please try again.");
    }
    html = await pageResponse.text();
  } catch {
    return fetchFailed("We couldn't reach that link. Please try again.");
  }

  const extracted = rule.extract(html);
  let imageHref: string | null = null;
  if (extracted.image) {
    try {
      // Resolve against the page URL so protocol-relative (`//host/...`) and
      // relative image references become absolute.
      const resolved = new URL(extracted.image, target);
      // Hold the image hop to the same https-only rule as the page URL. The
      // image reference comes from page-controlled markup, so this keeps a
      // crafted `og:image`/JSON-LD value from steering the server fetch at a
      // non-https target (file://, http:// metadata endpoints, and the like).
      if (resolved.protocol === "https:") imageHref = resolved.href;
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
    });
    if (!imageResponse.ok) {
      return fetchFailed("We couldn't download that image. Please try again.");
    }
  } catch {
    return fetchFailed("We couldn't download that image. Please try again.");
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
