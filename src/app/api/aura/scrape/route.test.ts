import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import { MAX_PHOTO_BYTES } from "@/lib/validations";

// Clerk is the only module mocked. `admitGoogleAuraIdentity` runs for real, and
// Prisma, Cloudinary, and aura-config are deliberately never mocked here — their
// absence is the assertion that this endpoint touches none of them.
let userId: string | null;
let clerkUser: {
  emailAddresses: {
    emailAddress: string;
    verification: { status: "verified" | "unverified" };
  }[];
  externalAccounts: {
    provider: "google" | "github";
    emailAddress: string;
    firstName: string;
    lastName: string;
    verification: { status: "verified" | "unverified" };
  }[];
} | null;

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => clerkUser,
}));

const { POST, SCRAPE_USER_AGENT } = await import("./route");

// --- Network seam: a URL-dispatch router over globalThis.fetch --------------

type Reply = () => Response | Promise<Response>;
type Route = { when: (url: string) => boolean; reply: Reply };

const realFetch = globalThis.fetch;
let routes: Route[];
let fetchCalls: { url: string; headers: Record<string, string> }[];

function installFetch() {
  routes = [];
  fetchCalls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    fetchCalls.push({
      url,
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    const route = routes.find((r) => r.when(url));
    if (!route) throw new Error(`unrouted fetch: ${url}`);
    return route.reply();
  }) as typeof fetch;
}

function route(when: (url: string) => boolean, reply: Reply) {
  routes.push({ when, reply });
}

const hostContains = (fragment: string) => (url: string) =>
  url.includes(fragment);

function html(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function imageBytes(
  bytes: Buffer,
  { type = "image/jpeg", length }: { type?: string; length?: number } = {},
): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": type,
      "content-length": String(length ?? bytes.byteLength),
    },
  });
}

// An oversized image: an honest-looking Content-Length above the limit, backed
// by a stream that errors if read. Reaching the body at all fails the test, so
// this proves the guard fires on the header before any download.
function oversizedImage(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.error(new Error("body must not be read after Content-Length guard"));
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(MAX_PHOTO_BYTES + 1),
    },
  });
}

const GARMENT = Buffer.from("garment-bytes");
const GARMENT_DATA_URI = `data:image/jpeg;base64,${GARMENT.toString("base64")}`;

const PIN_URL = "https://www.pinterest.com/pin/some-slug--1234567890/";
const PIN_IMAGE = "https://i.pinimg.com/originals/aa/bb/cc/garment.jpg";
const MYNTRA_URL = "https://www.myntra.com/roadster/roadster-men-shirt/1234567/buy";

function pinterestPage({
  image = PIN_IMAGE,
  title,
}: { image?: string | null; title?: string } = {}): string {
  return `<!doctype html><html><head>
    ${title ? `<meta property="og:title" content="${title}">` : ""}
    ${image ? `<meta property="og:image" content="${image}">` : ""}
  </head><body></body></html>`;
}

const post = (body: unknown = { url: PIN_URL }) =>
  POST(
    new Request("http://localhost/api/aura/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  installFetch();
  userId = "clerk_user_1";
  clerkUser = {
    emailAddresses: [
      { emailAddress: "ada@example.com", verification: { status: "verified" } },
    ],
    externalAccounts: [
      {
        provider: "google",
        emailAddress: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        verification: { status: "verified" },
      },
    ],
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("POST /api/aura/scrape", () => {
  describe("auth gate", () => {
    it("rejects an unauthenticated caller with 401", async () => {
      userId = null;

      const response = await post();

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "unauthorized", retryable: false }),
      );
      expect(fetchCalls).toHaveLength(0);
    });
  });

  describe("request validation", () => {
    it("rejects a missing url as invalid-request", async () => {
      const response = await post({});

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "invalid-request", retryable: false }),
      );
      expect(fetchCalls).toHaveLength(0);
    });

    it("rejects a malformed url as invalid-request", async () => {
      const response = await post({ url: "not a url" });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "invalid-request", retryable: false }),
      );
      expect(fetchCalls).toHaveLength(0);
    });
  });

  describe("allowlist (rejects before any network call)", () => {
    const cases: Record<string, string> = {
      "a non-allowlisted host": "https://example.com/pin/1234567890/",
      "a Pinterest ccTLD": "https://www.pinterest.co.uk/pin/1234567890/",
      "an http:// url": "http://www.pinterest.com/pin/1234567890/",
      "a bad Pinterest path shape": "https://www.pinterest.com/board/inspo/",
    };

    for (const [label, url] of Object.entries(cases)) {
      it(`rejects ${label} as unsupported-domain`, async () => {
        const response = await post({ url });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({
            code: "unsupported-domain",
            retryable: false,
          }),
        );
        expect(fetchCalls).toHaveLength(0);
      });
    }
  });

  describe("coming soon (recognised, not yet scraped)", () => {
    // Recognised shops answer with a named "coming soon" and never touch the
    // network — matched on host, so an off-shape path on the domain still lands
    // here rather than in unsupported-domain.
    const cases: Record<string, string> = {
      "a Myntra product link": MYNTRA_URL,
      "an off-shape Myntra link": "https://www.myntra.com/roadster/shirt/reviews",
      "an Ajio link": "https://www.ajio.com/p/12345",
      "a Zara link": "https://www.zara.com/in/en/product-p12345.html",
    };

    for (const [label, url] of Object.entries(cases)) {
      it(`answers coming-soon for ${label} without any network call`, async () => {
        const response = await post({ url });

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({ code: "coming-soon", retryable: false }),
        );
        expect(fetchCalls).toHaveLength(0);
      });
    }

    it("names the shop in the coming-soon message", async () => {
      const body = (await (await post({ url: MYNTRA_URL })).json()) as {
        error: string;
      };
      expect(body.error).toContain("Myntra");
    });
  });

  describe("fetch-failed (retryable)", () => {
    it("maps a page transport error to fetch-failed", async () => {
      route(hostContains("pinterest.com"), () => {
        throw new TypeError("network down");
      });

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "fetch-failed", retryable: true }),
      );
    });

    it("maps an image transport error to fetch-failed", async () => {
      route(hostContains("pinterest.com"), () => html(pinterestPage()));
      route(hostContains("pinimg.com"), () => {
        throw new TypeError("connection reset");
      });

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "fetch-failed", retryable: true }),
      );
    });

    it("maps a non-OK page response to fetch-failed", async () => {
      route(hostContains("pinterest.com"), () => new Response("nope", { status: 503 }));

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "fetch-failed", retryable: true }),
      );
    });
  });

  describe("no-image-found", () => {
    it("returns no-image-found when a Pinterest page has no og:image", async () => {
      route(hostContains("pinterest.com"), () =>
        html(pinterestPage({ image: null, title: "A pin" })),
      );

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "no-image-found", retryable: false }),
      );
    });

    it("refuses a non-https image reference without fetching it", async () => {
      route(hostContains("pinterest.com"), () =>
        html(pinterestPage({ image: "http://169.254.169.254/latest/meta-data" })),
      );

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "no-image-found", retryable: false }),
      );
      // Only the page was fetched; the page-controlled image ref never was.
      expect(fetchCalls).toHaveLength(1);
    });

    it("returns no-image-found for an empty image body", async () => {
      route(hostContains("pinterest.com"), () => html(pinterestPage()));
      route(hostContains("pinimg.com"), () => imageBytes(Buffer.alloc(0)));

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "no-image-found", retryable: false }),
      );
    });
  });

  // Defense-in-depth for the second (image) fetch hop. The image URL is
  // page-controlled markup, so beyond https-only it must resolve to the matched
  // source's known CDN host. A crafted `og:image`/JSON-LD value aimed at a
  // private, loopback, link-local, or otherwise non-CDN target — the residual
  // SSRF vector after https-only — is refused before any network call. Only the
  // page route is registered in each case: if the guard failed to fire, the
  // unrouted image fetch would surface as `fetch-failed` (502), not the
  // `no-image-found` (422) these assert, and `fetchCalls` would be 2, not 1.
  describe("SSRF hardening (image hop)", () => {
    const blockedPinterestImages: Record<string, string> = {
      "a link-local metadata address": "https://169.254.169.254/latest/meta-data/",
      "a loopback address": "https://127.0.0.1/garment.jpg",
      "an IPv6 loopback address": "https://[::1]/garment.jpg",
      "a private 192.168 address": "https://192.168.1.10/garment.jpg",
      "a private 10.x address": "https://10.0.0.5/garment.jpg",
      "a public but non-CDN host": "https://evil.example.com/garment.jpg",
      "a CDN-lookalike host": "https://i.pinimg.com.evil.example.com/garment.jpg",
      "userinfo masking an internal IP": "https://i.pinimg.com@169.254.169.254/garment.jpg",
      "another shop's CDN": "https://assets.myntassets.com/assets/images/1/garment.jpg",
    };

    for (const [label, image] of Object.entries(blockedPinterestImages)) {
      it(`refuses ${label} without fetching it`, async () => {
        route(hostContains("pinterest.com"), () => html(pinterestPage({ image })));

        const response = await post({ url: PIN_URL });

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({ code: "no-image-found", retryable: false }),
        );
        expect(fetchCalls).toHaveLength(1);
      });
    }

    it("still fetches an image on the source's own allowlisted CDN host", async () => {
      route(hostContains("pinterest.com"), () => html(pinterestPage()));
      route(hostContains("pinimg.com"), () => imageBytes(GARMENT));

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(200);
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls[1].url).toBe(PIN_IMAGE);
    });
  });

  describe("image validation", () => {
    it("rejects a non-accepted image MIME as wrong-type", async () => {
      route(hostContains("pinterest.com"), () => html(pinterestPage()));
      route(hostContains("pinimg.com"), () =>
        imageBytes(GARMENT, { type: "image/gif" }),
      );

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "wrong-type", retryable: false }),
      );
    });

    it("rejects an oversized image on Content-Length before downloading", async () => {
      route(hostContains("pinterest.com"), () => html(pinterestPage()));
      route(hostContains("pinimg.com"), () => oversizedImage());

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ code: "image-too-large", retryable: false }),
      );
    });
  });

  describe("success", () => {
    it("returns a Pinterest garment from og:image", async () => {
      route(hostContains("pinterest.com"), () =>
        html(pinterestPage({ title: "Tailored wool coat" })),
      );
      route(hostContains("pinimg.com"), () => imageBytes(GARMENT));

      const response = await post({ url: PIN_URL });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        image: GARMENT_DATA_URI,
        name: "Tailored wool coat",
        source: "pinterest",
      });
    });

  });

  it("sends an honest User-Agent on every outbound hop", async () => {
    route(hostContains("pinterest.com"), () => html(pinterestPage({ title: "Pin" })));
    route(hostContains("pinimg.com"), () => imageBytes(GARMENT));

    const response = await post({ url: PIN_URL });

    expect(response.status).toBe(200);
    expect(fetchCalls).toHaveLength(2);
    for (const call of fetchCalls) {
      expect(call.headers["user-agent"]).toBe(SCRAPE_USER_AGENT);
    }
  });
});
