# Research: can the image model swap clothing from a supplied garment image?

**Ticket:** wayfinder #52 — child of map #51 (AURA virtual try-on).

The map locks **portrait-as-input**: feed the saved `AuraProfile.portraitUrl` plus a supplied
garment image to image editing and get back the same person wearing that garment. This ticket
establishes whether the provider supports that operation and on what terms.

Facts and citations only. The judgement about whether the *result* is good enough belongs to the
prototype ticket (#54) that this blocks. Where the documentation is silent this note says
**not documented** rather than inferring.

> **Docs moved.** `platform.openai.com/docs/*` now 301-redirects to `developers.openai.com`.
> `platform.openai.com` returns 403 to unauthenticated fetches. All OpenAI citations below are to
> the `developers.openai.com` locations.

---

## Short answer

**Yes — the operation is supported, and it is the ordinary multi-image edit path we already use.**
`images.edit` accepts an array of input images; the array is exactly the mechanism for supplying a
subject and a garment together. A mask is **optional**, not required. Nothing in the primary
documentation contradicts the portrait-as-input decision.

Two things worth carrying into #54, neither of which invalidates the decision:

1. OpenAI's input array is **not role-typed** — see below.
2. A **purpose-built, role-typed try-on model exists** from Google (`virtual-try-on-001`, GA), which
   takes a person image and product images as distinct named fields.

---

## 1. Does `images.edit` accept multiple input images with distinct roles?

**Multiple images: yes. Distinct roles: no — not in the API.**

- The `image` parameter is "The image(s) to edit. Must be a supported image file or an array of
  images." For GPT image models (`gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`,
  `gpt-image-2-2026-04-21`, `chatgpt-image-latest`): "each image should be a png, webp, or jpg file
  less than 50MB. You can provide up to 16 images."
  — <https://developers.openai.com/api/reference/python/resources/images/methods/edit>
- The **only** positional role the API documents is mask application: "If you provide multiple input
  images, the mask will be applied to the first image."
  — <https://developers.openai.com/api/docs/guides/image-generation>
- Beyond that, the array is undifferentiated reference material the model composites according to
  the prompt. The cookbook's worked example passes several images (a cat portrait plus a separate
  hat image) and instructs the model to render the cat wearing the hat — i.e. **subject + item
  composition is the documented, intended use of the array**, and the subject/item distinction is
  carried entirely by the prompt text.
  — <https://developers.openai.com/cookbook/examples/generate_images_with_gpt_image>

**What this means for `src/lib/aura-portrait.ts`.** The existing code passes
`image: [front, closeup]` and disambiguates them in prose inside `AURA_STUDIO_PROMPT`
("Image 1 is the subject's full-body… Image 2 is the subject's face close-up"). That is the correct
and only documented way to assign roles. Try-on would follow the identical shape:
`image: [portrait, garment]` plus prompt text naming which is which. There is **no** typed
`subject:` / `garment:` field, and the docs make **no** guarantee that the model honours the
prompt's ordering claim.

**Documented inconsistency — flag for #54.** The API reference says "up to 16 images"
(<https://developers.openai.com/api/reference/python/resources/images/methods/edit>) while the
cookbook says "You can use a maximum of 10 input images"
(<https://developers.openai.com/cookbook/examples/generate_images_with_gpt_image>). Try-on needs 2,
so this is immaterial here, but the sources disagree.

---

## 2. Is a mask required, supported, or optional?

**Optional.** Masking is supported but not required for editing an existing subject.

Documented mask semantics:

- "An additional image whose fully transparent areas (e.g. where alpha is zero) indicate where image
  should be edited." Must be "a valid PNG file, less than 4MB, and have the same dimensions as
  image." — <https://developers.openai.com/api/reference/python/resources/images/methods/edit>
- "The mask image must also contain an alpha channel."
  — <https://developers.openai.com/api/docs/guides/image-generation>
- "The image to edit and mask must be of the same format and size (less than 50MB)." — *ibid.*
- With multiple inputs, "the mask will be applied on the first image." — *ibid.*
- **Fidelity caveat, quoted:** "Masking with GPT Image is entirely prompt-based. The model uses the
  mask as guidance, but may not follow its exact shape with complete precision." — *ibid.*

**Not documented:** any clothing-specific or garment-region masking guidance; any statement that a
mask improves garment replacement; any automatic body/clothing segmentation. The cookbook shows
generating a mask by asking a model for one and converting it to an alpha PNG, but that is an
example technique, not a documented try-on recipe.

Practically: a mask is a *possible* lever for confining the edit to the clothing region, but the
docs explicitly downgrade it to guidance rather than a hard constraint, so it cannot be relied on
to protect the face. That is a prototype question.

---

## 3. Hard limits

| Limit | Value | Source |
|---|---|---|
| Max input images | "up to 16 images" (cookbook says 10 — sources disagree) | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit), [cookbook](https://developers.openai.com/cookbook/examples/generate_images_with_gpt_image) |
| Input formats | png, webp, jpg | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| Max input file size | < 50MB each | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| Mask | PNG, < 4MB, same dimensions as image, must have alpha | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `n` | 1–10 | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `size` (common set) | `auto`, `1024x1024`, `1536x1024`, `1024x1536` | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `size` (gpt-image-2 extra) | arbitrary `WIDTHxHEIGHT`: divisible by 16, aspect ratio between 1:3 and 3:1, max edge ≤ 3840, max `3840x2160`, total pixels 655,360–8,294,400 | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit), [guide](https://developers.openai.com/api/docs/guides/image-generation) |
| `quality` | `low`, `medium`, `high`, `auto` (default `auto`) | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `output_format` | `png`, `jpeg`, `webp` | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `background` | `transparent`, `opaque`, `auto` — **gpt-image-2 does not support transparent** | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| `input_fidelity` | `high`/`low`, default `low` — **only gpt-image-1 / gpt-image-1.5+; not settable on gpt-image-2** | [ref](https://developers.openai.com/api/reference/python/resources/images/methods/edit) |
| Rate limits (gpt-image-2) | Tier 1: 100,000 TPM / 5 IPM → Tier 5: 8,000,000 TPM / 250 IPM | [model card](https://developers.openai.com/api/docs/models/gpt-image-2) |

Two notes that bear directly on our existing call:

- **`input_fidelity` is moot on gpt-image-2 and that is good news for likeness.** "For `gpt-image-2`
  the API doesn't allow changing it because the model processes every image input at high fidelity
  automatically." — <https://developers.openai.com/api/docs/guides/image-generation>. Identity
  preservation is therefore on by default; no parameter to set.
- **`background: "opaque"` in `generateAuraPortrait` is safe**, but a future switch to
  `"transparent"` would not work on gpt-image-2.

**Images-per-minute (IPM) is the binding rate limit**, not tokens — 5/min at Tier 1. Relevant to the
map's open "cost and rate-limit posture" item.

---

## 4. Latency and cost at `1024x1536`, `quality: "medium"`

**Cost — gpt-image-2 per-image price (this is the size and quality `generateAuraPortrait` uses today):**

| Quality | 1024×1024 | **1024×1536** | 1536×1024 |
|---|---|---|---|
| Low | $0.006 | **$0.005** | $0.005 |
| Medium | $0.053 | **$0.041** | $0.041 |
| High | $0.211 | **$0.165** | $0.165 |

— <https://developers.openai.com/api/docs/guides/image-generation>

**So a try-on at today's settings costs ≈ $0.041 per generated image.** `gpt-image-2` uses this
specialised per-image pricing rather than pure per-token output billing (*ibid.*).

Underlying token rates, if needed for input accounting (per 1M tokens):
gpt-image-2 — text input **$5.00**, image input **$8.00**, image output **$30.00**; batch is half
(text $2.50 / image input $4.00 / image output $15.00).
— <https://developers.openai.com/api/docs/pricing>

Note try-on sends **two** input images (portrait + garment) rather than the portrait flow's two
reference photos, so input-token cost is comparable to today's portrait call.

**Latency — barely documented.** The only quantitative statement found is: "Complex prompts may take
up to 2 minutes to process." — <https://developers.openai.com/api/docs/guides/image-generation>.
The gpt-image-2 model card rates Speed as "Medium"
(<https://developers.openai.com/api/docs/models/gpt-image-2>). Per-call latency at a given
size/quality is **not documented**; it must be measured in the prototype.

> **Concrete risk for #54:** `PORTRAIT_REQUEST_TIMEOUT_MS` in `src/lib/aura-portrait.ts` is
> **75,000 ms**, below the documented 2-minute worst case. A try-on path reusing that budget can
> time out on a slow-but-succeeding call. Also `maxRetries: 1` means a timeout is paid for twice.

Streaming is available to hide latency: `stream: true` with `partial_images` between 0 and 3
(<https://developers.openai.com/api/reference/python/resources/images/methods/edit>), costing "an
additional 100 tokens per partial image"
(<https://developers.openai.com/api/docs/guides/image-generation>). Note the gpt-image-2 model card
lists Streaming as "Not supported"
(<https://developers.openai.com/api/docs/models/gpt-image-2>) — **the sources conflict**; treat
streaming on gpt-image-2 as unverified.

---

## 5. Moderation behaviour, and the error shape

**The `moderation` parameter** applies to GPT Image models (`gpt-image-2`, `gpt-image-1.5`,
`gpt-image-1`, `gpt-image-1-mini`):

- `"auto"` (default) — "Standard filtering that seeks to limit creating certain categories of
  potentially age-inappropriate content"
- `"low"` — "Less restrictive filtering"

— <https://developers.openai.com/api/docs/guides/image-generation>

**The documented error shape:**

```json
{
  "error": {
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "moderation_details": {
      "moderation_stage": "input|output|unknown",
      "categories": ["harassment", "self-harm", "sexual", "violence"]
    }
  }
}
```

— <https://developers.openai.com/api/docs/guides/image-generation>

`moderation_stage` distinguishes a block on the **input** (prompt/images supplied) from one on the
**output** (what the model produced), or `unknown`. Guidance is to branch on
`error.code === "moderation_blocked"` first and treat `moderation_details` as optional extra
context — input-stage blocks warrant asking the user to revise, output-stage blocks are a
generated-result safety block.

**How this lands in `classifyProviderError`.** The existing classifier in `src/lib/aura-portrait.ts`
already buckets **both** `code === "moderation_blocked"` and `code === "image_generation_user_error"`
into `kind: "refused", retryable: false`. That matches the documented shape and needs no change for
try-on. What it does **not** do is preserve `moderation_details` — so the app currently cannot tell
an input-stage refusal (user should swap the garment image) from an output-stage one (retry might
work), nor which category fired. That is a real design input for the map's open "moderation and
consent" item, though it is a product decision, not a fact this ticket settles.

**Apparel-specific moderation: not documented.** No OpenAI documentation retrieved names clothing,
garments, apparel, fashion, or virtual try-on in a moderation context. The only signal is indirect:
`"sexual"` is one of the four documented `categories`, and the default `"auto"` filter is described
in terms of "potentially age-inappropriate content" — which is the category a garment such as
swimwear, lingerie, or sheer clothing would plausibly trip when applied to a photorealistic person.
**Whether it actually does is not documented and must be measured** in #54.

**Images of people / likeness: not documented in the API docs.** The Images guide and API reference
contain no likeness-or-consent clause. `openai.com/policies/usage-policies/` returns **HTTP 403** to
unauthenticated fetches, so the usage policy could not be read from a primary source in this
session — the consent question the map raises is therefore **unresolved here** and needs either an
authenticated read of the usage policies or a separate ticket. Do not treat silence as permission.

---

## 6. Is there a purpose-built garment try-on capability?

**From OpenAI: no.** No OpenAI documentation retrieved mentions virtual try-on, garment swapping, or
apparel as a named capability. Try-on via `images.edit` is a general-purpose image-composition
capability applied to a clothing use case, not a supported product feature with its own contract.

**From Google (the obvious alternative): yes — and it is generally available.**

`virtual-try-on-001` on Vertex AI:

- Purpose statement: generates "virtual try-on images from an image of a person and product photos
  that you provide" — the model "generates images of people wearing clothing products."
  — <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/image/generate-virtual-try-on-images>
- **Role-typed request**, unlike OpenAI: distinct `personImage` and `productImages` fields, plus
  `sampleCount` ("The accepted range of values is `1` to `4`"). — *ibid.*
- GA as of **January 20, 2026**; `virtual-try-on-001` replaces the earlier
  `virtual-try-on-preview-08-04` endpoint.
  — <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/virtual-try-on-preview-08-04>,
  <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes>
- Limits: max input file size **10MB**; formats `image/png`, `image/jpeg`; output resolution and
  aspect ratio "Same as input image"; max 4 images per request; regional quota **50 requests per
  minute** per base model. — [model card](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/virtual-try-on-preview-08-04)
- Supports digital watermarking/verification (SynthID) and Content Credentials (C2PA);
  user-configurable safety settings; prompt language limited to English. — *ibid.*
- **Explicit limitation:** general image generation is not supported — the model only performs
  try-on transformations on supplied images. — *ibid.*
- The preview model was updated 2025-09-30 "to more accurately preserve the person's body shape and
  preserve the garment's identity", with reduced latency and improved quality for shoes, body-shape
  preservation, and product fidelity. — <https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes>
- **Pricing: not documented** on the pages retrieved (the model card defers to the Imagen pricing
  page, which did not yield per-image try-on rates). **Latency: not documented.**

### How the two compare, on documented facts only

| | OpenAI `images.edit` + `gpt-image-2` | Vertex `virtual-try-on-001` |
|---|---|---|
| Subject/garment roles | Prompt-only; array is untyped | Typed `personImage` / `productImages` |
| Purpose-built for try-on | No | Yes |
| Identity/body-shape preservation | High input fidelity automatic, no try-on-specific claim | Explicit release-note claim for body shape + garment identity |
| Output size control | Flexible (`size`, up to 3840×2160) | Fixed: same as input image |
| Watermarking | Not documented | SynthID + C2PA |
| Per-image cost | $0.041 at 1024×1536 medium | Not documented |
| Latency | Not documented (≤2 min worst case overall) | Not documented |
| Rate limit | 5–250 images/min by tier | 50 req/min regional |
| New dependency for this repo | **None** — `getOpenAI()` and the image model are already wired | New cloud vendor, credential, SDK, and billing account |

The integration-cost asymmetry is large and is the honest argument for OpenAI in a prototype: the
app already calls `images.edit` with a two-image array through `getOpenAI()`. Adopting Vertex means
a new provider boundary from scratch. Whether the purpose-built model's quality justifies that is
precisely the #54 question.

---

## Does any of this cast doubt on the locked "portrait-as-input" decision?

**No.** Both the incumbent provider and the purpose-built alternative are built around exactly this
shape: a fixed image of a person plus a garment image in, a composited image out. Vertex's API
literally names the fields `personImage` and `productImages`. The decision is well-supported.

The findings sharpen *how* it is implemented rather than whether:

- Roles are **prompt-asserted, not API-guaranteed**, on OpenAI. Ordering and prose in the prompt are
  the only levers, mirroring `AURA_STUDIO_PROMPT`.
- A mask is optional and explicitly "guidance" only — it is not a reliable face-protection mechanism.
- The **75s timeout** in `aura-portrait.ts` sits under the documented 2-minute worst case.
- Apparel-specific moderation and likeness/consent policy are **not documented**; the map's open
  items on those remain genuinely open, and the usage-policy page could not be read here.

---

## Open items this ticket deliberately does not settle

- Whether the output quality is good enough — #54 (prototype).
- Whether to preserve `moderation_details` (stage + categories) in `AuraPortraitError` — product
  decision downstream.
- OpenAI usage-policy provisions on depicting real people and consent — blocked on a 403; needs an
  authenticated read or its own ticket.
- Vertex try-on pricing and latency — not documented in retrieved primary sources.
