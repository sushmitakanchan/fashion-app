# Ubiquitous language

## AURA profile

The minimal, privacy-conscious record a participant saves before a portrait can
be generated: an AURA display name, the two required AURA reference photos, any
supplied 3D avatar reference photos, timestamped consent to third-party AI
processing, and the generated AURA portrait. There is one per user; re-saving
replaces it rather than adding another. It holds no demographic or body-profile
data — no age, gender, height, weight, or body type.

## AURA display name

The name shown on an AURA profile. It is owned by AURA: seeded from the
participant's Google name on a first save when one is usable, editable
afterwards, and never written back to the Google or Clerk account it came from.

## AURA portrait

The static, polished studio-style portrait generated for an AURA profile in v1.
It is derived from two required reference photos: a full-body, front-facing
photo and a face close-up. It is not a body-accurate, rotatable 3D digital twin.

## AURA reference photos

The two required user-supplied inputs used to create an AURA portrait: a
full-body, front-facing photo and a face close-up.

## 3D avatar reference photos

Optional left, right, and back photos for a future 3D avatar. The v1 form makes
this future intent explicit with a “Coming soon” tag, but does not create a 3D
avatar or make these photos a prerequisite for an AURA portrait. They are
retained when supplied; every completed v1 profile generates an AURA portrait.

## AI provider selection

The server-side configuration that selects the AI provider for an AI request. It is configurable in every environment; when omitted, it defaults to OpenAI. Production does not override an explicit selection.

Selection uses Vercel AI SDK with direct OpenAI and Anthropic provider packages. It does not use Vercel AI Gateway; each provider uses its own credentials and billing relationship.

## Text generation

The current provider-neutral AI capability: a non-streaming server-side exchange of a system prompt and a user prompt for reply text. Streaming, tool calls, images, and provider-specific request options are not part of this capability yet.
