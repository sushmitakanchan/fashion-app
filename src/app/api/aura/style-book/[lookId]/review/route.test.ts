import { beforeEach, describe, expect, it, mock } from "bun:test";

/** Route tests keep auth, Prisma, and the model behind their module seams. */
let userId: string | null = "clerk_user_1";
let row: {
  caption: string;
  lookImageUrl: string;
  portraitUrl: string;
  sources: unknown;
} | null = null;

const findFirst = mock(async () => row);
const generateText = mock(async () => ({ text: validReview() }));

class AiProviderConfigError extends Error {}

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ savedLook: { findFirst } }),
}));

mock.module("@/lib/ai", () => ({ AiProviderConfigError, generateText }));

const { GET } = await import("./route");

function validReview() {
  return JSON.stringify({
    overallScore: 4.4,
    description: "A polished layered look with a crisp, tailored finish.",
    outfitReview:
      "It’s giving brunch-to-date energy: tailored layers read polished on you, with a cohesive tonal palette near the face.",
    categories: [
      {
        key: "fit",
        score: 4.5,
        verdict: "Strong layered proportions",
        evidence: "The long outer layer creates a clean vertical line.",
        nextStep: "Try a slightly shorter top layer for a sharper break.",
      },
      {
        key: "colour",
        score: 4.2,
        verdict: "Cohesive tonal palette",
        evidence: "The dark neutrals read as a controlled, unified palette.",
        nextStep: "Add one muted accent near the face for more contrast.",
      },
      {
        key: "styling",
        score: 4.4,
        verdict: "Intentional finishing details",
        evidence: "The footwear and bag reinforce the refined mood.",
        nextStep: "Swap one structured piece for texture on a more casual day.",
      },
    ],
  });
}

const request = () =>
  GET(new Request("http://localhost/api/aura/style-book/look_1/review"), {
    params: Promise.resolve({ lookId: "look_1" }),
  });

beforeEach(() => {
  userId = "clerk_user_1";
  row = {
    caption: "Wool coat & cropped trousers",
    lookImageUrl: "https://res.cloudinary.test/look.jpg",
    portraitUrl: "https://res.cloudinary.test/portrait.jpg",
    sources: [{ name: "Wool coat" }, { name: "Cropped trousers" }],
  };
  findFirst.mockClear();
  findFirst.mockImplementation(async () => row);
  generateText.mockClear();
  generateText.mockImplementation(async () => ({ text: validReview() }));
});

describe("GET /api/aura/style-book/[lookId]/review", () => {
  it("refuses unauthenticated requests before the lookup", async () => {
    userId = null;

    const response = await request();

    expect(response.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("owner-scopes the look lookup and hides a scoped miss", async () => {
    row = null;

    const response = await request();

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "look_1", user: { clerkId: "clerk_user_1" } },
      select: expect.any(Object),
    });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("passes server-owned look and portrait URLs to the vision boundary", async () => {
    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      overallScore: 4.4,
      categories: [{ key: "fit" }, { key: "colour" }, { key: "styling" }],
    });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { url: "https://res.cloudinary.test/look.jpg" },
          { url: "https://res.cloudinary.test/portrait.jpg" },
        ],
      }),
    );
  });

  it("returns a retryable failure for malformed model output", async () => {
    generateText.mockImplementation(async () => ({ text: "not JSON" }));

    const response = await request();

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid-review-response",
      retryable: true,
    });
  });

  it("reports a missing selected provider without falling back", async () => {
    generateText.mockImplementation(async () => {
      throw new AiProviderConfigError("missing key");
    });

    const response = await request();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "ai-unavailable",
      retryable: true,
    });
  });
});
