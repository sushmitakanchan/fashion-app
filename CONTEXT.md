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

## Outfit calendar

A weekly, per-occasion planning surface at `/aura/calendar` that proposes one
outfit per event from a participant's own wardrobe. It is in-app pull — the
participant opens it; nothing is pushed — and wardrobe-only: it flags gaps but
never suggests shopping. Opening it is a pure read, showing live weather beside
each event with no AI call, until the participant asks for a plan or regenerates a
single outfit. It is net-new on top of the wardrobe, the try-on generator, and
the text-generation boundary, and reuses those generators rather than their data
models.

## Planned event

One dated occasion on the Outfit Calendar. It is added manually, which always
works, or imported read-only from Google Calendar, in which case it is badged
"Google" and arrives unplanned. It carries a title, an occasion, a time (start,
optional end, all-day), and an optional geocoded place. Its title is stored but
never egresses to any third party: the planner works from occasion, place, and
weather only. It is hard-deleted, not soft-deleted.

## Planned outfit

The proposed set of wardrobe items for one Planned Event, shown as item tiles with
an AURA rationale and an optional on-demand try-on preview. Unlike a saved look —
an immutable snapshot of a past look preserved in the Style Book — a planned
outfit tracks live wardrobe items and is mutable: as the wardrobe changes it can
become partial or empty, which the calendar reads as an honest gap rather than
corruption (see `docs/adr/0001-planned-outfits-track-live-wardrobe-items.md`). A
planned outfit and a saved look are deliberately separate; there is no link
between them.

## Occasion

A short, free-text label for the kind of event an outfit is for, such as "casual",
"office", or "dinner date". It is shared vocabulary: the same free-text field
lives on a wardrobe item, describing what a piece is suited to, and on a planned
event, describing what the event calls for, and the planner matches one against
the other. On a planned event it is owner-entered, or defaulted to a generic
occasion when left blank; it is never AI-inferred from the event title.

## Style preference

A single, optional free-text note in which a participant tells AURA how they like
to dress: tones, vibe, formality lean, fabrics they love, and anything they avoid.
There is one per user, editable at any time and replaced on each edit. It is a
soft signal fed verbatim to the planner and never gates planning; when absent, the
planner simply omits it. It is plain content, not a consent record — its egress to
the AI planner is governed by the planning-consent gate.
