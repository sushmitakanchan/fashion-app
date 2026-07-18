import { beforeEach, describe, expect, it, mock } from "bun:test";

type EditRequest = {
  image: File[];
  prompt: string;
  model: string;
  size: string;
  quality: string;
  output_format: string;
  background: string;
  user: string;
};

type EditOptions = { timeout: number; maxRetries: number };
type EditStub = (
  request: EditRequest,
  options: EditOptions,
) => Promise<{ data?: { b64_json?: string }[] }>;
type FetchStub = (url: string | URL | Request) => Promise<Response>;

let edit: ReturnType<typeof mock<EditStub>>;
let fetchReference: ReturnType<typeof mock<FetchStub>>;

mock.module("server-only", () => ({}));

mock.module("@/lib/openai", () => ({
  getOpenAI: () => ({
    images: {
      edit: (request: EditRequest, options: EditOptions) => edit(request, options),
    },
  }),
}));

const { generateAuraPortrait } = await import("./aura-portrait");

beforeEach(() => {
  edit = mock(async () => ({ data: [{ b64_json: "portrait-bytes" }] }));
  fetchReference = mock(async (url: string | URL | Request) =>
    new Response(String(url).includes("front") ? "front-bytes" : "closeup-bytes", {
      headers: { "content-type": "image/jpeg" },
    }),
  );
  globalThis.fetch = fetchReference as unknown as typeof fetch;
});

describe("generateAuraPortrait", () => {
  it("forwards only the two saved AURA references in a bounded OpenAI edit request", async () => {
    const portrait = await generateAuraPortrait({
      clerkId: "clerk_user_1",
      photoFrontUrl: "https://images.test/front.jpg",
      photoCloseupUrl: "https://images.test/closeup.jpg",
    });

    expect(portrait).toBe("portrait-bytes");
    expect(fetchReference).toHaveBeenCalledTimes(2);
    expect(edit).toHaveBeenCalledTimes(1);

    const [request, options] = edit.mock.calls[0];
    expect(request).toMatchObject({
      model: "gpt-image-2",
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      background: "opaque",
      user: "clerk_user_1",
    });
    expect(request.prompt).toContain("Image 1");
    expect(request.prompt).toContain("Image 2");
    expect(request.prompt).toMatch(/not .*measurements/i);
    await expect(request.image[0].text()).resolves.toBe("front-bytes");
    await expect(request.image[1].text()).resolves.toBe("closeup-bytes");
    expect(options).toEqual({ timeout: 75_000, maxRetries: 1 });
  });

  it("classifies provider moderation refusals as non-retryable", async () => {
    edit = mock(async () => {
      throw { code: "moderation_blocked", status: 400 };
    });

    await expect(
      generateAuraPortrait({
        clerkId: "clerk_user_1",
        photoFrontUrl: "https://images.test/front.jpg",
        photoCloseupUrl: "https://images.test/closeup.jpg",
      }),
    ).rejects.toMatchObject({
      kind: "refused",
      retryable: false,
    });
  });

  it("classifies timed-out provider calls as retryable", async () => {
    edit = mock(async () => {
      throw new DOMException("deadline", "TimeoutError");
    });

    await expect(
      generateAuraPortrait({
        clerkId: "clerk_user_1",
        photoFrontUrl: "https://images.test/front.jpg",
        photoCloseupUrl: "https://images.test/closeup.jpg",
      }),
    ).rejects.toMatchObject({
      kind: "timeout",
      retryable: true,
    });
  });

  it("classifies a transient provider failure as retryable", async () => {
    edit = mock(async () => {
      throw { status: 503 };
    });

    await expect(
      generateAuraPortrait({
        clerkId: "clerk_user_1",
        photoFrontUrl: "https://images.test/front.jpg",
        photoCloseupUrl: "https://images.test/closeup.jpg",
      }),
    ).rejects.toMatchObject({
      kind: "transient",
      retryable: true,
    });
  });

  it("classifies an empty provider response as retryable", async () => {
    edit = mock(async () => ({ data: [] }));

    await expect(
      generateAuraPortrait({
        clerkId: "clerk_user_1",
        photoFrontUrl: "https://images.test/front.jpg",
        photoCloseupUrl: "https://images.test/closeup.jpg",
      }),
    ).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: true,
    });
  });
});
