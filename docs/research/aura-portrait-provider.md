# Research: image-generation provider for the AURA studio portrait

**Ticket:** wayfinder #19 — Which supported image-generation provider and API workflow can
reliably produce and store a polished studio-style AURA portrait from the required full-body
front photo plus face close-up, and what technical constraints should shape the v1 design?

This ticket decides; it does not implement. Every claim below cites its source. Facts read
from the installed packages in `node_modules/` (the authority for what our code can call) are
cited by file path; web claims by URL. Estimates are marked **estimate**; anything not
verified against a primary source is marked **unverified**.

---

## The question, restated against the app

- Inputs: **two user photos** — full-body front + face close-up. Both already cross the wire
  to `POST /api/aura` as base64 data URIs (`src/lib/validations.ts` — `photoDataUriSchema`
  enforces `data:image/(jpeg|png|webp);base64,...`) and are uploaded to Cloudinary with
  deterministic public ids (`src/app/api/aura/route.ts`).
- Output: one polished studio-style portrait, stored in **Cloudinary**.
- Execution: **synchronous inside the submission route handler** (Next.js 16, Bun), with
  progress + retry in the UI — so latency and platform timeouts are first-order constraints.
- Existing AI boundary: `generateText()` in `src/lib/ai` (Vercel AI SDK + direct
  `@ai-sdk/openai` / `@ai-sdk/anthropic`, no Gateway). Anthropic has **no image-generation
  API**, so the in-house candidates are all OpenAI-backed; non-OpenAI options mean a new
  dependency and credential.

---

## What the installed packages actually support (verified)

Versions from `bun.lock` / `node_modules`: `ai@7.0.31`, `@ai-sdk/openai@4.0.16`,
`openai@6.47.0`, `cloudinary@2.10.0`, `next@16.2.10`.

### `ai@7.0.31` — stable `generateImage` with multi-image reference input

- `generateImage` is a **stable export** (not `experimental_`), alongside
  `GenerateImageResult` and `NoImageGeneratedError`
  (`node_modules/ai/dist/index.d.ts`, export list and `declare function generateImage`, ~line 7063).
- Its prompt type is
  `type GenerateImagePrompt = string | { images: Array<DataContent>; text?: string; mask?: DataContent }`
  (`node_modules/ai/dist/index.d.ts` ~line 7039). **Multiple input reference images are
  supported at the SDK boundary.** Note the public docs at
  <https://ai-sdk.dev/docs/ai-sdk-core/image-generation> do not document the images-prompt
  form yet; the installed `.d.ts`/`dist` is authoritative for what we can call.
- `DataContent = string | Uint8Array | ArrayBuffer | Buffer`
  (`node_modules/@ai-sdk/provider-utils/dist/index.d.ts` line 105). `normalizePrompt` in
  `node_modules/ai/dist/index.js` (~line 11752) accepts each image as an `http(s)` URL
  (provider downloads it), a `data:` URI (decoded to bytes), a raw base64 string, or bytes —
  so we can pass either the Cloudinary `secure_url`s or the data URIs already in the request
  body. **Both photo forms we have work as-is.**
- Result: `GenerateImageResult.image` is a `GeneratedFile` exposing `.base64`,
  `.uint8Array`, and `.mediaType` (`node_modules/ai/dist/index.d.ts`, `interface GeneratedFile`)
  — directly convertible to the `data:` URI that `cloudinary.uploader.upload` accepts.
- Retry/abort: `maxRetries` (default **2**) and `abortSignal` parameters
  (`node_modules/ai/dist/index.d.ts`, `generateImage` signature). If a call returns zero
  images, `generateImage` throws `NoImageGeneratedError` (with per-call response metadata)
  (`node_modules/ai/dist/index.js`, `if (!images.length) throw new NoImageGeneratedError(...)`).

### `@ai-sdk/openai@4.0.16` — routes image-input prompts to `/images/edits`

- `openai.image(modelId)` supports model ids `'dall-e-3' | 'dall-e-2' | 'gpt-image-1' |
  'gpt-image-1-mini' | 'gpt-image-1.5' | 'gpt-image-2' | 'chatgpt-image-latest'`
  (`node_modules/@ai-sdk/openai/dist/index.d.ts` line 50).
- When the prompt carries `files` (i.e. `images` were passed), `OpenAIImageModel.doGenerate`
  POSTs **multipart form-data to `/images/edits`** with `image` as an **array of Blobs** —
  one per input image — plus `prompt`, `mask`, `n`, `size`, and provider options
  (`node_modules/@ai-sdk/openai/dist/index.js` ~lines 2244–2300). URL-form images are
  downloaded server-side via `downloadBlob`. Without input images it POSTs JSON to
  `/images/generations`. **The AI SDK path fully covers the two-reference-photo edit
  workflow; the raw-client escape hatch is not forced.**
- Edit-call provider options (`providerOptions.openai`): `quality`, `background`,
  `outputFormat` (`png|jpeg|webp`), `outputCompression`, `user`, and
  **`inputFidelity: 'high' | 'low'`** (`node_modules/@ai-sdk/openai/dist/index.d.ts`
  ~lines 69–77). The generation-side `moderation: 'auto'|'low'` option exists **only** for
  `/images/generations`, not for edits (ibid. ~lines 59–68).
- Response images are read from `b64_json` and returned as base64; token usage and
  per-image metadata are surfaced via `providerMetadata.openai`
  (`node_modules/@ai-sdk/openai/dist/index.js`, edits branch).
- Errors: non-2xx responses are parsed by `openaiFailedResponseHandler` against
  `openaiErrorDataSchema` — `{ error: { message, type?, param?, code? } }` — and thrown as
  `APICallError` with `statusCode`, `responseBody`, `isRetryable` (set for server errors),
  and the parsed `data` (`node_modules/@ai-sdk/openai/dist/index.js` lines 28–43;
  `node_modules/@ai-sdk/provider/dist/index.d.ts`, `class APICallError`).

### `openai@6.47.0` (raw client, escape hatch) — `images.edit` capabilities

From `node_modules/openai/resources/images.d.ts`, `ImageEditParamsBase` (line 435):

- `image: Uploadable | Array<Uploadable>` — for the GPT image models, "each image should be
  a `png`, `webp`, or `jpg` file less than 50MB. You can provide up to 16 images."
- `model` — one of `dall-e-2` or the GPT image models (`gpt-image-1`, `gpt-image-1-mini`,
  `gpt-image-1.5`, `gpt-image-2`, `gpt-image-2-2026-04-21`, `chatgpt-image-latest`);
  **defaults to `gpt-image-1.5`**.
- `input_fidelity?: 'high' | 'low'` — "Control how much effort the model will exert to match
  the style and features, **especially facial features**, of input images… only supported for
  `gpt-image-1` and `gpt-image-1.5` and later models, unsupported for `gpt-image-1-mini`.
  Defaults to `low`." (Per the OpenAI image guide, `gpt-image-2` "always processes every
  image input at high fidelity automatically" —
  <https://developers.openai.com/api/docs/guides/image-generation>.)
- Output: "GPT image models always return base64-encoded images" (`response_format` url is
  dall-e-2 only; dall-e-2 URLs expire after 60 minutes). `output_format` `png|jpeg|webp`,
  `output_compression` 0–100 for jpeg/webp.
- Sizes: `1024x1024`, `1536x1024`, `1024x1536`, `auto` for GPT image models; `gpt-image-2`
  additionally supports arbitrary `WIDTHxHEIGHT` (divisible by 16, aspect 1:3–3:1, max
  `3840x2160`).
- Streaming: `stream: boolean` with `partial_images` 0–3 (`ImageEditParamsStreaming`) —
  usable later for real progress; the AI SDK `generateImage` path is non-streaming.
- Prompt limit: 32,000 characters for GPT image models.

### Cloudinary output handoff (verified against repo + docs)

`src/lib/cloudinary.ts` config-plus-upload already accepts "a remote URL, a local path, or a
base64 data URI"; the Cloudinary upload docs confirm Data URI (Base64) and remote-URL inputs
(<https://cloudinary.com/documentation/upload_images>). Since GPT image models return
base64 only, the route converts `GeneratedFile.base64` + `.mediaType` into a data URI and
uploads with a deterministic public id (e.g. `fashion-app/aura/{userId}/portrait`,
`overwrite: true`) — same idempotent-retry pattern the five photo uploads already use in
`src/app/api/aura/route.ts`. Plan-dependent max asset size is not stated in the docs page
(it defers to the account console); the portrait at 1024x1536 png/jpeg is single-digit MB —
far below the 100 MB chunked-upload threshold — so no practical concern (**estimate** on the
output file size).

---

## Candidate workflows compared

### A. AI SDK `generateImage` + `@ai-sdk/openai` image model (RECOMMENDED)

- **Reference images:** yes — `prompt: { images: [frontUrl, closeupUrl], text: "…studio
  portrait…" }` hits `/images/edits` with both photos (verified above).
- **Face preservation:** `providerOptions.openai.inputFidelity: 'high'` (supported for
  `gpt-image-1`/`gpt-image-1.5`+; the close-up exists precisely to give the model facial
  detail).
- **Output:** base64 `GeneratedFile` → data URI → Cloudinary. No temp files.
- **Failure semantics:** `APICallError` (with OpenAI `error.code`) and
  `NoImageGeneratedError`; `maxRetries` default 2 retries only retryable (server) errors —
  a 400 `moderation_blocked` is not retried.
- **Fit:** stays inside the sanctioned Vercel-AI-SDK boundary; extends `src/lib/ai` with a
  sibling image capability instead of feature code touching a vendor SDK. Zero new
  dependencies or credentials (`OPENAI_API_KEY` only).
- **Cost:** none beyond OpenAI usage. Provider-neutrality is nominal (Anthropic can't serve
  it), so the image capability should *not* consult `AI_PROVIDER` — it is OpenAI-or-error,
  with its own `AiProviderConfigError`-style config error when `OPENAI_API_KEY` is absent
  (mirrors the no-fallback rule in `src/lib/ai/provider.ts`).

### B. Raw `openai` client via `getOpenAI()` (`src/lib/openai.ts`)

- Everything in A is available plus: >10 images, masks on the raw endpoint, **streaming
  partial images**, arbitrary `gpt-image-2` resolutions, and typed SDK errors.
- Costs: bypasses the AI SDK boundary (repo convention says the raw clients are "an escape
  hatch… not the default path for feature code" — `AGENTS.md`), and we'd hand-roll retry
  classification the AI SDK already does. Nothing v1 needs is exclusive to it.
- Verdict: keep as the documented fallback if v1 later wants streamed progress
  (`partial_images`) piped to the UI; not needed for v1.

### C. Google via `@ai-sdk/google` (or fal/Replicate)

- **Not installed** — `node_modules/@ai-sdk/` contains only `anthropic`, `gateway`,
  `openai`, `provider`, `provider-utils` (verified by listing). Any of these means a new
  package, a new credential (e.g. `GOOGLE_GENERATIVE_AI_API_KEY`; fal/Replicate keys), a new
  healthcheck entry (`src/lib/healthcheck/config.ts`), and a new billing relationship —
  exactly the cost the no-fallback provider rule exists to make explicit.
- Capability: Google's Gemini image models do multi-image editing, but the AI SDK's public
  image-generation docs surface them through multimodal `generateText` output
  ("Some language models such as Google `gemini-2.5-flash-image` support multi-modal
  outputs" — <https://ai-sdk.dev/docs/ai-sdk-core/image-generation>); whether the installed
  `ai@7` `generateImage` images-prompt works against a matching `@ai-sdk/google` was **not
  verified** (package not installed).
- Verdict: real option if OpenAI's people-image moderation proves too strict in practice,
  but it is a new-vendor decision, not a v1 default.

---

## Latency, timeouts, and the synchronous route

- OpenAI's image guide: **"Complex prompts may take up to 2 minutes to process."**
  Lower `quality` is the documented lever for faster results
  (<https://developers.openai.com/api/docs/guides/image-generation>). Typical
  gpt-image edit calls at medium/high quality commonly run tens of seconds
  (**estimate** — OpenAI publishes no p50/p95).
- Worst-case budget must include the AI SDK's default **2 retries** → up to ~3× a slow call.
  Recommendation: set `maxRetries: 0` or `1` for the portrait call and pass an
  `abortSignal` (`AbortSignal.timeout(...)`) so the route, not the platform, decides the
  deadline.
- Platform ceilings: Next.js exposes `export const maxDuration` per route
  (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`).
  On Vercel with fluid compute the **default max duration is already 300 s on every plan**
  (max 800 s on Pro/Enterprise, 1800 s extended beta) —
  <https://vercel.com/docs/functions/configuring-functions/duration>. A self-hosted Bun
  deployment has no platform timeout. So a single edit call + Cloudinary upload fits the
  default window even in the documented worst case; still set `maxDuration` explicitly on
  the route so the budget is pinned in code.
- The five existing photo uploads + Prisma writes precede generation in the same request;
  keep the portrait as the **last** step so its failure can be reported distinctly and
  retried without re-uploading photos.

## Failure semantics the route must handle

Through the AI SDK path, failures surface as:

1. **Config error** — no `OPENAI_API_KEY`: throw the image-boundary config error before any
   network call (mirror `AiProviderConfigError`).
2. **`APICallError`** (`@ai-sdk/provider`): carries `statusCode`, `isRetryable` (server
   errors), and parsed OpenAI `data.error = { message, type?, param?, code? }`.
   - **Moderation refusal:** `error.code = "moderation_blocked"`, optionally with
     `moderation_details` including `moderation_stage` (`input`/`output`/`unknown`) and
     `categories` (<https://developers.openai.com/api/docs/guides/image-generation>). This is
     a 4xx: the AI SDK will **not** retry it, and neither should the UI's retry button
     without changed inputs — map it to a distinct user-facing "we couldn't generate a
     portrait from these photos" response (422), separate from the retryable 502 path.
   - **403 organization-not-verified:** gpt-image access requires OpenAI **organization
     verification** (government-ID based); propagation up to ~30 min after verifying
     (<https://x.com/OpenAIDevs/status/1915097084308410816>,
     <https://community.openai.com/t/gpt-images-1-403-what-are-the-conditions-for-requesting-this-model-gpt-image-1/1245846>
     — official announcement + community; the help-center page was not directly fetchable:
     **partially secondary**). This is a deployment precondition, not a runtime bug.
   - 5xx / network / timeout: retryable; the route's existing 502 pattern fits.
3. **`NoImageGeneratedError`** — provider returned success but zero images; treat as
   retryable server weirdness.
4. **Cloudinary upload failure after successful generation** — pay-for-generation is lost on
   retry; acceptable for v1 (idempotent deterministic public id makes retries safe), noted
   as a cost, not a correctness issue.

## Safety constraints (images of real people)

- OpenAI usage policy prohibits use of "someone's likeness… without their consent"
  (openai.com/policies/usage-policies returns 403 to non-browser fetches; wording via search
  snapshot of the policy page — **secondary confirmation of a primary source**:
  <https://openai.com/policies/usage-policies/>). Our workflow is the consented case: users
  upload **their own** photos and the schema already refuses submission without consent
  (`consentedAt`, `src/app/api/aura/route.ts`). Keep the consent copy explicit that photos
  are sent to an AI provider to generate the portrait — today's consent text predates this
  feature (design note, not a verified policy requirement).
- All prompts and images are "filtered in accordance with our content policy"; the
  **edits endpoint has no `moderation` parameter** (generation-only, and only `auto|low`),
  so input-photo refusals cannot be tuned down — the route must degrade gracefully
  (verified: `openaiImageModelEditOptions` has no moderation field;
  <https://developers.openai.com/api/docs/guides/image-generation>;
  <https://community.openai.com/t/no-option-to-lower-moderation-for-image-edit/1250225>).
- Expect occasional false-positive `moderation_blocked` on ordinary people photos
  (community reports; **anecdotal**) — the UI's retry affordance should offer "try different
  photos", not just "try again".

## Credentials at deploy time

| Workflow | Env vars | Extra setup |
| --- | --- | --- |
| A (AI SDK + OpenAI) | `OPENAI_API_KEY` (already in `src/lib/env.ts` + healthcheck) | OpenAI **organization verification** for gpt-image models |
| B (raw client) | same | same |
| C (Google) | new `GOOGLE_GENERATIVE_AI_API_KEY` + `bun add @ai-sdk/google` + healthcheck entry | new vendor/billing |
| Storage (all) | `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` (already required for live submission) | — |

Optionally add a portrait-model env (e.g. `OPENAI_IMAGE_MODEL`, default `gpt-image-1.5` —
matching the endpoint's own default) alongside the existing `OPENAI_MODEL` pattern.

---

## RECOMMENDATION

**Workflow A: extend the AI SDK boundary — `generateImage` from `ai` with
`openai.image("gpt-image-1.5")` from the already-installed `@ai-sdk/openai`, calling the
`/images/edits` flow with both reference photos, then upload the base64 result to Cloudinary
under a deterministic public id.**

Sketch of the call the design should assume (verified against installed types):

```ts
const { image } = await generateImage({
  model: openai.image("gpt-image-1.5"),
  prompt: {
    images: [photoFrontUrl, photoCloseupUrl], // Cloudinary secure_urls or data URIs
    text: STUDIO_PORTRAIT_PROMPT,
  },
  size: "1024x1536",
  maxRetries: 1,
  abortSignal: AbortSignal.timeout(PORTRAIT_TIMEOUT_MS),
  providerOptions: { openai: { inputFidelity: "high", quality: "high", outputFormat: "jpeg" } },
});
await cloudinary.uploader.upload(`data:${image.mediaType};base64,${image.base64}`, {
  public_id: `fashion-app/aura/${userId}/portrait`, overwrite: true, resource_type: "image",
});
```

Technical constraints that should shape the v1 design:

1. **OpenAI-only capability, no `AI_PROVIDER` involvement** — Anthropic cannot serve it;
   fail with a config error when `OPENAI_API_KEY` is missing, never fall back (matches the
   existing no-fallback rule).
2. **Model `gpt-image-1.5`** (endpoint default, supports `input_fidelity: high`); make it
   env-overridable. Avoid `gpt-image-1-mini` (no input-fidelity support).
3. **Portrait size `1024x1536`** (portrait orientation, standard size on all GPT image
   models); `jpeg` output to keep the stored asset small.
4. **Own the deadline**: `abortSignal` timeout well under the platform cap, `maxRetries` ≤ 1,
   `export const maxDuration` set explicitly on the route; portrait generation is the last
   step of submission so photo upload + profile persistence never ride on it.
5. **Map `moderation_blocked` (APICallError, `data.error.code`) to a distinct,
   non-retryable user-facing error**; retryable 5xx/timeout → the existing 502 pattern;
   `NoImageGeneratedError` → retryable.
6. **Deployment preconditions**: OpenAI org verification for gpt-image access; Cloudinary
   creds already required. Add the portrait capability to the healthcheck credential map.
7. **Consent copy** must cover sending the two photos to OpenAI for portrait generation
   (policy requires likeness use to be consented; ours is, but say so in the UI).

Fallbacks, in order, if A hits a wall: B (raw `getOpenAI().images.edit`) only if v1 needs
streamed partial-image progress; C (Google) only if OpenAI moderation of real-people edits
proves unusable in practice — both are new scope, not v1.
