import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Boundary tests for the optional OpenAI wardrobe analysis. The vendor client is
 * stubbed at `@/lib/openai`, so every path — a clean suggestion and each
 * needs-review fallback — is observed as the outcome the boundary returns, plus
 * the exact request it sent (store:false, low detail, only the normalized image
 * and a fixed prompt, never a confirmed attribute).
 */

type CreateArgs = {
  model: string;
  store?: boolean;
  input: Array<{ role: string; content: Array<Record<string, unknown>> }>;
  text?: unknown;
};

let nextResponse: unknown = null;
let nextError: unknown = null;
let lastArgs: CreateArgs | null = null;

mock.module("server-only", () => ({}));

mock.module("@/lib/openai", () => ({
  OPENAI_MODEL: "gpt-4o-mini",
  getOpenAI: () => ({
    responses: {
      create: async (args: CreateArgs) => {
        lastArgs = args;
        if (nextError) throw nextError;
        return nextResponse;
      },
    },
  }),
}));

const {
  analyzeWardrobeImage,
  WARDROBE_ANALYSIS_POLICY_VERSION,
  WARDROBE_ANALYSIS_DISCLOSURE,
} = await import("./wardrobe-analysis");

/** Shape a Responses-API reply carrying structured JSON. */
function jsonResponse(payload: unknown) {
  return {
    output_text: JSON.stringify(payload),
    output: [
      { type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] },
    ],
  };
}

const IMG = "https://media.example.test/normalized.webp?sig=abc";

beforeEach(() => {
  nextResponse = null;
  nextError = null;
  lastArgs = null;
});

afterEach(() => {
  mock.restore();
});

describe("analyzeWardrobeImage — success", () => {
  it("returns an editable suggestion for a confident single garment", async () => {
    nextResponse = jsonResponse({
      assessment: "single_garment",
      category: "tops",
      color: "Ivory",
      brand: "AURA",
      occasion: "office",
    });

    const outcome = await analyzeWardrobeImage(IMG, "clerk_user_1");

    expect(outcome).toEqual({
      status: "suggested",
      suggestion: { category: "tops", color: "Ivory", brand: "AURA", occasion: "office" },
    });
  });

  it("keeps a nullable colour, brand, and occasion null rather than inventing them", async () => {
    nextResponse = jsonResponse({
      assessment: "single_garment",
      category: "shoes",
      color: null,
      brand: null,
      occasion: null,
    });

    const outcome = await analyzeWardrobeImage(IMG, "clerk_user_1");
    expect(outcome).toEqual({
      status: "suggested",
      suggestion: { category: "shoes", color: null, brand: null, occasion: null },
    });
  });

  it("sends only the normalized image + prompt, with store:false and low detail", async () => {
    nextResponse = jsonResponse({ assessment: "single_garment", category: "bags", color: "Tan", brand: null, occasion: null });

    await analyzeWardrobeImage(IMG, "clerk_user_1");

    expect(lastArgs?.store).toBe(false);
    const content = lastArgs?.input?.[0]?.content ?? [];
    const image = content.find((part) => part.type === "input_image");
    expect(image).toMatchObject({ image_url: IMG, detail: "low" });
    // No confirmed attributes are ever part of the request.
    const serialized = JSON.stringify(lastArgs);
    expect(serialized).not.toContain("Ivory");
    expect(serialized.toLowerCase()).not.toContain("edit history");
    // Exactly one text prompt and one image — nothing else.
    expect(content.filter((p) => p.type === "input_image")).toHaveLength(1);
    expect(content.filter((p) => p.type === "input_text")).toHaveLength(1);
  });
});

describe("analyzeWardrobeImage — needs-review fallbacks (never fabricates)", () => {
  it("multiple garments → needs-review", async () => {
    nextResponse = jsonResponse({ assessment: "multiple_garments", category: "tops", color: "Blue", brand: null, occasion: null });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "multiple-garments" });
  });

  it("unclear image → needs-review (uncertain)", async () => {
    nextResponse = jsonResponse({ assessment: "unclear", category: null, color: null, brand: null, occasion: null });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "uncertain" });
  });

  it("confident but no category → needs-review (uncertain)", async () => {
    nextResponse = jsonResponse({ assessment: "single_garment", category: null, color: "Red", brand: null, occasion: null });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "uncertain" });
  });

  it("model refusal → needs-review (refused)", async () => {
    nextResponse = {
      output_text: "",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
    };
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "refused" });
  });

  it("invalid structured output → needs-review (invalid-response)", async () => {
    nextResponse = { output_text: "not json at all", output: [] };
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "invalid-response" });
  });

  it("output that fails the schema → needs-review (invalid-response)", async () => {
    nextResponse = jsonResponse({ assessment: "single_garment", category: "hats", color: null, brand: null, occasion: null });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "invalid-response" });
  });

  it("a timeout → needs-review (timeout)", async () => {
    nextError = Object.assign(new Error("aborted"), { name: "AbortError" });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "timeout" });
  });

  it("a content-policy rejection → needs-review (policy-rejected)", async () => {
    nextError = Object.assign(new Error("blocked"), { status: 400, code: "image_content_policy_violation" });
    expect(await analyzeWardrobeImage(IMG, "u")).toEqual({ status: "needs-review", reason: "policy-rejected" });
  });

  it("any other provider error → needs-review, still no fabrication", async () => {
    nextError = Object.assign(new Error("boom"), { status: 500 });
    const outcome = await analyzeWardrobeImage(IMG, "u");
    expect(outcome.status).toBe("needs-review");
  });
});

describe("disclosure + policy version", () => {
  it("names OpenAI, normalized images, editable suggestions, and retention", () => {
    const text = WARDROBE_ANALYSIS_DISCLOSURE.toLowerCase();
    expect(text).toContain("openai");
    expect(text).toContain("normalized");
    expect(text).toContain("edit");
    expect(text).toMatch(/30 days|retain/);
    expect(WARDROBE_ANALYSIS_POLICY_VERSION.length).toBeGreaterThan(0);
  });
});
