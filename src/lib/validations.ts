import { z } from "zod";

/**
 * Shared AURA Zod schemas. Because they live in a plain module they can be
 * reused on the client (React Hook Form) and on the server (Route Handlers /
 * actions).
 *
 * This is the single policy source for both boundaries. The browser form holds
 * real `File`s and the wire submission holds base64 data URIs, but every other
 * rule — the display name, which photos are required, accepted types, the size
 * limit, consent, and refusing unknown keys — is defined once here so the
 * server never has to take the client's word for any of it.
 */

/** The two photos that are required to save an AURA portrait profile. */
export const AURA_REFERENCE_PHOTO_ANGLES = ["front", "closeup"] as const;

/** Future 3D-avatar inputs. They are stored when supplied, never required. */
export const AVATAR_PHOTO_ANGLES = ["left", "right", "back"] as const;

/** Every profile photo field, in deterministic Cloudinary upload order. */
export const PHOTO_ANGLES = [
  ...AURA_REFERENCE_PHOTO_ANGLES,
  ...AVATAR_PHOTO_ANGLES,
] as const;

export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** 15 MiB per photo, measured on the image itself rather than its encoding. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

// Photos are downscaled to this long edge before upload. Phone cameras produce
// 4000px+ images; five of those base64-encoded would blow past the request body
// limit, and the extra detail is unnecessary for portrait generation.
export const PHOTO_MAX_EDGE = 1600;

const PHOTO_TOO_LARGE = "Photo must be under 15 MiB";
const PHOTO_WRONG_TYPE = "Use a JPEG, PNG, or WebP image";

/** Minimum trimmed length of the AURA display name. Exported so the form's
 *  completion indicator applies the same "name is filled in" rule the schema
 *  validates against — the two can't drift. */
export const AURA_NAME_MIN_LENGTH = 2;

const auraFields = {
  // The AURA display name. It belongs to the AURA profile, not to the Google or
  // Clerk account it was seeded from, so editing it never travels back upstream.
  name: z
    .string({ error: "Please enter your name" })
    .trim()
    .min(AURA_NAME_MIN_LENGTH, "Please enter your name")
    .max(60, "That name is a little too long"),
  // Consent gates the submit button, so this is a backstop rather than the
  // primary check — but the server must not take our word for it.
  consent: z
    .boolean()
    .refine((v) => v === true, "Please agree before generating your AURA"),
};

const photoFile = z
  .instanceof(File, { error: "Add a photo" })
  .refine((f) => f.size <= MAX_PHOTO_BYTES, PHOTO_TOO_LARGE)
  .refine((f) => ACCEPTED_PHOTO_TYPES.includes(f.type), PHOTO_WRONG_TYPE);

const PHOTO_DATA_URI_HEADER = /^data:image\/(?:jpeg|png|webp);base64,/;
// Deliberately flat rather than a `(?:[A-Za-z0-9+/]{4})*` group: these payloads
// run to tens of millions of characters, and the nested quantifier makes the
// engine give up on exactly the large-but-legal photos we mean to accept.
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/;

const base64Payload = (dataUri: string) =>
  dataUri.slice(dataUri.indexOf(",") + 1);

function isPhotoDataUri(uri: string): boolean {
  if (!PHOTO_DATA_URI_HEADER.test(uri)) return false;

  const base64 = base64Payload(uri);
  // A well-formed payload is a whole number of 4-character base64 quanta, so a
  // truncated or padded-wrong string is rejected before anything decodes it.
  return base64.length > 0 && base64.length % 4 === 0 && BASE64_PAYLOAD.test(base64);
}

/**
 * The decoded size of a base64 payload, without decoding it. Every 4 encoded
 * characters carry 3 bytes, less however many the padding stands in for.
 */
function decodedByteLength(uri: string): number {
  const base64 = base64Payload(uri);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

// The browser already limits each `File`, but a request can be made without the
// browser. Re-check the type (via the media type the URI declares) and the size
// (via the decoded byte count) so a hand-rolled request is held to the same rule.
//
// Exported so the wardrobe import route can validate each image *individually*
// and report one bad image as a per-item failure, rather than rejecting the
// whole batch the way an array-level `photoDataUri` element would.
export const photoDataUri = z
  .string()
  .refine(isPhotoDataUri, PHOTO_WRONG_TYPE)
  .refine((uri) => decodedByteLength(uri) <= MAX_PHOTO_BYTES, PHOTO_TOO_LARGE);

/**
 * Required references plus optional future-3D ones. Strict, so an unrecognised
 * angle is a bad request rather than a silently dropped photo.
 */
const photos = <T extends z.ZodType>(photo: T) =>
  z.strictObject({
    front: photo,
    closeup: photo,
    left: photo.optional(),
    right: photo.optional(),
    back: photo.optional(),
  });

// Both objects are strict: the retired demographic and body-profile keys are
// unknown input now, so a client still sending them gets a 400 rather than
// having its data quietly ignored.

/** What the browser form holds: real `File`s, before any encoding. */
export const auraFormSchema = z.strictObject({
  ...auraFields,
  photos: photos(photoFile),
});

export type AuraFormInput = z.infer<typeof auraFormSchema>;

/** What crosses the wire to `POST /api/aura`: photos as base64 data URIs. */
export const auraSubmissionSchema = z.strictObject({
  ...auraFields,
  photos: photos(photoDataUri),
});

export type AuraSubmissionInput = z.infer<typeof auraSubmissionSchema>;

/** Upper bound on garments composited into a single ephemeral try-on look. */
export const MAX_TRY_ON_GARMENTS = 6;

/** Upper bound on a garment/source name — one policy shared by the try-on
 * garment, the Style Book save source, and the in-composer name the client
 * builds, so the cap can never drift between them. */
export const GARMENT_NAME_MAX_LENGTH = 80;

// A garment/source name — one policy shared by the try-on garment and the
// Style Book save source, so the cap can never drift between the two.
const garmentName = z
  .string({ error: "Name the garment" })
  .trim()
  .min(1, "Name the garment")
  .max(GARMENT_NAME_MAX_LENGTH, "That name is a little too long");

const tryOnGarment = z.object({
  // The untrusted upload crosses the wire exactly like a profile photo. The
  // regex enforces MIME + base64 shape here; the generator re-validates decoded
  // size/decodability at its boundary (`invalid-garment`).
  image: photoDataUri,
  name: garmentName,
});

// A source drawn from the participant's own private wardrobe. Only the item's
// opaque id crosses the wire — never its media or name. The server admits the id
// solely if it belongs to an active item owned by the caller, then resolves the
// authorized normalized rendition and saved name itself, so a forged, foreign,
// or deleted id can never reach generation.
const tryOnWardrobeSource = z.object({
  wardrobeItemId: z.string().trim().min(1, "Select a wardrobe item"),
});

/** One try-on source: an attached/scraped garment image, or a wardrobe item id. */
const tryOnSource = z.union([tryOnGarment, tryOnWardrobeSource]);

/** What crosses the wire to `POST /api/aura/try-on`: one-or-more sources, each
 * an image garment or a reference to one of the caller's own wardrobe items.
 * Both kinds share the single garment cap — a wardrobe item occupies a source
 * slot exactly like an upload. */
export const auraTryOnSchema = z.object({
  garments: z
    .array(tryOnSource)
    .min(1, "Attach at least one garment")
    .max(MAX_TRY_ON_GARMENTS, `Attach up to ${MAX_TRY_ON_GARMENTS} garments`),
});

export type AuraTryOnInput = z.infer<typeof auraTryOnSchema>;
export type AuraTryOnGarment = z.infer<typeof tryOnGarment>;
export type AuraTryOnSource = z.infer<typeof tryOnSource>;
export type AuraTryOnWardrobeSource = z.infer<typeof tryOnWardrobeSource>;

/** The inferred discriminator the try-on boundary applies: a source carrying a
 * `wardrobeItemId` is a wardrobe reference; anything else is an image garment.
 * No `kind` crosses the wire — this re-derives it. */
export function isTryOnWardrobeSource(
  source: AuraTryOnSource,
): source is AuraTryOnWardrobeSource {
  return "wardrobeItemId" in source;
}

/* -------------------------------------------------------------------------- */
/*                         Style Book — saving a look                         */
/* -------------------------------------------------------------------------- */

/** The sites a link Source can originate from. */
export const SAVED_LOOK_SOURCE_SITES = ["pinterest", "myntra"] as const;

export type SavedLookSourceSite = (typeof SAVED_LOOK_SOURCE_SITES)[number];

// A source is either an upload or a link, and provenance is *inferred* — no
// `kind` discriminator crosses the wire. `url`/`site` are optional and only
// meaningful together: both present ⇒ link (kept as retained future intent for
// a later "purchase this garment" affordance), both absent ⇒ upload. Anything
// in between is a malformed source rather than a silently-coerced one. The
// image reuses `photoDataUri` exactly like an upload/try-on garment, so one
// size/type policy governs every image AURA stores.
const saveSourceInput = z
  .object({
    image: photoDataUri,
    name: garmentName,
    url: z.url().optional(),
    site: z.enum(SAVED_LOOK_SOURCE_SITES).optional(),
  })
  .refine((source) => (source.url === undefined) === (source.site === undefined), {
    error: "A link source needs both a url and a site",
    path: ["url"],
  });

/**
 * What crosses the wire to `POST /api/aura/style-book`: the generated look and
 * the one-or-more sources that produced it, all as raw bytes. The look reuses
 * the same `photoDataUri` validator as every source image — one validator, no
 * separate or looser limit for the look. A completed try-on always carries at
 * least one garment, so `min(1)` is the shape of that existing guarantee, not a
 * new rule.
 */
export const styleBookSaveSchema = z.object({
  look: photoDataUri,
  // Bounded by the same shared garment cap as try-on: a saved look can only
  // ever hold the sources a completed try-on produced, and each source is one
  // Cloudinary upload, so the cap doubles as an upload ceiling on this write.
  sources: z
    .array(saveSourceInput)
    .min(1, "Save a look with at least one source")
    .max(MAX_TRY_ON_GARMENTS, `Save up to ${MAX_TRY_ON_GARMENTS} sources`),
});

export type StyleBookSaveInput = z.infer<typeof styleBookSaveSchema>;
export type SaveSourceInput = z.infer<typeof saveSourceInput>;

/* -------------------------------------------------------------------------- */
/*                    Wardrobe — importing & saving a batch                   */
/* -------------------------------------------------------------------------- */

/** How many images one import batch may carry. Enforced both in the import
 *  experience and at the server write boundary, so the two can't drift. */
export const WARDROBE_IMPORT_MAX_BATCH = 20;

/** The account-wide ceiling on *active* (non-deleted) Wardrobe Items. Checked at
 *  the server write boundary; a batch that would push past it is rejected. */
export const WARDROBE_MAX_ACTIVE_ITEMS = 200;

/** The persisted wardrobe categories — the browsing filter's concrete options
 *  minus its UI-only "all". Matches the Prisma `WardrobeItemCategory` enum, so
 *  every saved item lands in exactly one. */
export const WARDROBE_ITEM_CATEGORIES = [
  "tops",
  "bottoms",
  "dresses",
  "activewear",
  "outerwear",
  "bags",
  "shoes",
  "accessories",
] as const;

export const wardrobeItemCategorySchema = z.enum(WARDROBE_ITEM_CATEGORIES);

export type WardrobeItemCategoryValue = z.infer<typeof wardrobeItemCategorySchema>;

// One import image as it crosses the wire. The payload is a *loose* string, not
// `photoDataUri`: the import route validates each image on its own so a single
// unsupported or corrupt file surfaces as a per-item failure instead of a 400
// that discards the whole batch. `clientId` correlates each outcome back to the
// tile the browser is showing; it never reaches the database.
const wardrobeImportImage = z.object({
  clientId: z.string().trim().min(1).max(64),
  dataUri: z.string().min(1),
});

/** What crosses the wire to `POST /api/wardrobe/import`. */
export const wardrobeImportSchema = z.object({
  images: z
    .array(wardrobeImportImage)
    .min(1, "Add at least one image")
    .max(
      WARDROBE_IMPORT_MAX_BATCH,
      `Import up to ${WARDROBE_IMPORT_MAX_BATCH} images at a time`,
    ),
});

export type WardrobeImportInput = z.infer<typeof wardrobeImportSchema>;
export type WardrobeImportImageInput = z.infer<typeof wardrobeImportImage>;

const wardrobeItemName = z
  .string({ error: "Name this piece" })
  .trim()
  .min(1, "Name this piece")
  .max(GARMENT_NAME_MAX_LENGTH, "That name is a little too long");

const wardrobeItemColor = z
  .string({ error: "Add a colour" })
  .trim()
  .min(1, "Add a colour")
  .max(40, "That colour is a little too long");

// Optional and empty-tolerant: an untouched brand field arrives as "" and is
// normalised to `undefined` here so the route can persist `null` rather than an
// empty string. Missing or unreliable brand never blocks a save.
const wardrobeItemBrand = z
  .string()
  .trim()
  .max(60, "That brand is a little too long")
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// Same shape as brand: an AI-suggested, owner-editable occasion to wear the
// piece. Optional and empty-tolerant; a blank field is normalised to
// `undefined` so the route persists `null`, and it never blocks a save.
const wardrobeItemOccasion = z
  .string()
  .trim()
  .max(40, "That occasion is a little too long")
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

// A Cloudinary public id / format echoed back from an earlier import. The route
// additionally verifies the id sits under the caller's own wardrobe folder, so
// this only bounds shape and length, not ownership.
const wardrobeMediaId = z.string().min(1).max(256);
const wardrobeMediaFormat = z.string().trim().min(1).max(12);

// One owner-confirmed item ready to persist. Only confirmed attributes and the
// two private media references cross the wire; failed imports are removed in the
// review step and never reach this schema.
const wardrobeSaveItem = z.object({
  category: wardrobeItemCategorySchema,
  name: wardrobeItemName,
  color: wardrobeItemColor,
  brand: wardrobeItemBrand,
  occasion: wardrobeItemOccasion,
  originalMediaId: wardrobeMediaId,
  originalMediaFormat: wardrobeMediaFormat,
  normalizedMediaId: wardrobeMediaId,
  normalizedMediaFormat: wardrobeMediaFormat,
});

/** Confirmed attributes an owner may change after an item has been saved. A
 * PATCH may change one or more fields, but never accepts an empty update. */
export const wardrobeUpdateSchema = z
  .object({
    category: wardrobeItemCategorySchema.optional(),
    name: wardrobeItemName.optional(),
    color: wardrobeItemColor.optional(),
    // Unlike a save, an explicit blank update means "clear the saved brand";
    // an omitted key means leave it unchanged.
    brand: z
      .string()
      .trim()
      .max(60, "That brand is a little too long")
      .transform((value) => (value.length > 0 ? value : null))
      .optional(),
    // Same "blank clears, omitted leaves unchanged" contract as brand.
    occasion: z
      .string()
      .trim()
      .max(40, "That occasion is a little too long")
      .transform((value) => (value.length > 0 ? value : null))
      .optional(),
  })
  .refine(
    (value) =>
      value.category !== undefined ||
      value.name !== undefined ||
      value.color !== undefined ||
      value.brand !== undefined ||
      value.occasion !== undefined,
    { message: "Change at least one attribute" },
  );

export type WardrobeUpdateInput = z.infer<typeof wardrobeUpdateSchema>;

/** What crosses the wire to `POST /api/wardrobe` (batch save). */
export const wardrobeSaveSchema = z.object({
  items: z
    .array(wardrobeSaveItem)
    .min(1, "Confirm at least one piece")
    .max(
      WARDROBE_IMPORT_MAX_BATCH,
      `Save up to ${WARDROBE_IMPORT_MAX_BATCH} pieces at a time`,
    ),
});

export type WardrobeSaveInput = z.infer<typeof wardrobeSaveSchema>;
export type WardrobeSaveItemInput = z.infer<typeof wardrobeSaveItem>;

/* -------------------------------------------------------------------------- */
/*                 Wardrobe — optional AI analysis of a batch                 */
/* -------------------------------------------------------------------------- */

// One image submitted for optional AI categorisation. Only the *normalized*
// rendition's id/format cross the wire — never the original, and never any
// confirmed attribute or edit — so the analysis boundary can send strictly the
// normalized clothing image and nothing else. The route re-checks the id is the
// caller's own before signing it.
const wardrobeAnalyzeItem = z.object({
  clientId: z.string().trim().min(1).max(64),
  normalizedMediaId: wardrobeMediaId,
  normalizedMediaFormat: wardrobeMediaFormat,
});

/** What crosses the wire to `POST /api/wardrobe/analyze`. */
export const wardrobeAnalyzeSchema = z.object({
  items: z
    .array(wardrobeAnalyzeItem)
    .min(1, "Add at least one image to analyse")
    .max(
      WARDROBE_IMPORT_MAX_BATCH,
      `Analyse up to ${WARDROBE_IMPORT_MAX_BATCH} images at a time`,
    ),
});

export type WardrobeAnalyzeInput = z.infer<typeof wardrobeAnalyzeSchema>;
export type WardrobeAnalyzeItemInput = z.infer<typeof wardrobeAnalyzeItem>;

/**
 * What crosses the wire to `POST /api/wardrobe/analyze/consent` (grant). The
 * client echoes back the exact policy version it disclosed, so a stale
 * disclosure can't record consent to a newer policy — the route rejects a
 * mismatch against the server's current version.
 */
export const wardrobeConsentGrantSchema = z.object({
  policyVersion: z.string().trim().min(1).max(64),
});

export type WardrobeConsentGrantInput = z.infer<typeof wardrobeConsentGrantSchema>;

/**
 * What crosses the wire to `POST /api/aura/calendar/consent` (grant Smart
 * Planning consent). The client echoes back the exact policy version it
 * disclosed; the route rejects a mismatch against the server's current version
 * so a stale disclosure can't record consent to newer terms. `PlanningConsent`
 * versions this as an Int (unlike the wardrobe policy's string scheme).
 */
export const planningConsentGrantSchema = z.object({
  policyVersion: z.number().int(),
});

export type PlanningConsentGrantInput = z.infer<typeof planningConsentGrantSchema>;

/**
 * What the client echoes on every Smart Planning *egress* call (live weather
 * now; AI planning in a later ticket): the exact `policyVersion` it disclosed.
 * The egress boundary (`isPlanningEgressAllowed`) refuses a stale echo, so a
 * wording change re-prompts before the next outside contact. Same one-field
 * shape as the consent grant — one version scheme, re-declared here so the
 * egress routes read against an intent-named schema.
 */
export const planningEgressSchema = z.object({
  policyVersion: z.number().int(),
});

export type PlanningEgressInput = z.infer<typeof planningEgressSchema>;

/* -------------------------------------------------------------------------- */
/*                   Outfit Calendar — manual planned events                  */
/* -------------------------------------------------------------------------- */

/** Bounds on the manual-event fields. The `title` is the owner's own label and
 *  is generous; `occasion` shares the free-text vocabulary of
 *  `WardrobeItem.occasion`; `placeText` is captured raw (never geocoded here). */
export const PLANNED_EVENT_TITLE_MAX_LENGTH = 120;
export const PLANNED_EVENT_OCCASION_MAX_LENGTH = 60;
export const PLANNED_EVENT_PLACE_MAX_LENGTH = 200;

/** What an event's `occasion` becomes when the owner leaves it blank. The
 *  occasion is owner-entered/defaulted — never AI-suggested from the title. */
export const DEFAULT_PLANNED_OCCASION = "Everyday";

const PLANNED_EVENT_TITLE_TOO_LONG = "That title is a little too long";
const PLANNED_EVENT_OCCASION_TOO_LONG = "That occasion is a little too long";
const PLANNED_EVENT_PLACE_TOO_LONG = "That place is a little too long";
const PLANNED_EVENT_END_BEFORE_START = "End must be at or after the start";

const plannedEventTitle = z
  .string({ error: "Give this event a title" })
  .trim()
  .min(1, "Give this event a title")
  .max(PLANNED_EVENT_TITLE_MAX_LENGTH, PLANNED_EVENT_TITLE_TOO_LONG);

// Empty-tolerant on the wire: a blank occasion/place normalises to `undefined`
// so the route persists a default occasion / a null place rather than "".
const plannedEventOccasionWire = z
  .string()
  .trim()
  .max(PLANNED_EVENT_OCCASION_MAX_LENGTH, PLANNED_EVENT_OCCASION_TOO_LONG)
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

const plannedEventPlaceWire = z
  .string()
  .trim()
  .max(PLANNED_EVENT_PLACE_MAX_LENGTH, PLANNED_EVENT_PLACE_TOO_LONG)
  .transform((value) => (value.length > 0 ? value : undefined))
  .optional();

/**
 * The browser form for adding a manual event. Fields mirror the `PlannedEvent`
 * shape, but `when` is captured as local `datetime-local` / `date` strings the
 * viewer's browser interprets in their own timezone; the component converts them
 * to absolute ISO instants before submitting. This is the client analogue of
 * `plannedEventCreateSchema`, exactly as `auraFormSchema` (Files) pairs with
 * `auraSubmissionSchema` (data URIs).
 */
export const plannedEventFormSchema = z
  .object({
    title: plannedEventTitle,
    occasion: z
      .string()
      .trim()
      .max(PLANNED_EVENT_OCCASION_MAX_LENGTH, PLANNED_EVENT_OCCASION_TOO_LONG),
    allDay: z.boolean(),
    // A `date` value (YYYY-MM-DD) when all-day, else a `datetime-local` value
    // (YYYY-MM-DDTHH:mm). Both sort lexically within their own mode, which is
    // all the end-after-start check below needs.
    startsAtLocal: z.string().min(1, "Pick when this happens"),
    endsAtLocal: z.string(),
    placeText: z
      .string()
      .trim()
      .max(PLANNED_EVENT_PLACE_MAX_LENGTH, PLANNED_EVENT_PLACE_TOO_LONG),
  })
  .refine(
    (value) =>
      value.endsAtLocal.length === 0 ||
      value.endsAtLocal >= value.startsAtLocal,
    { message: PLANNED_EVENT_END_BEFORE_START, path: ["endsAtLocal"] },
  );

export type PlannedEventFormInput = z.input<typeof plannedEventFormSchema>;

/**
 * What crosses the wire to `POST /api/aura/calendar/events`. `startsAt`/`endsAt`
 * are absolute ISO-8601 instants (UTC); the server is the authority and never
 * takes the client's word for the shape. Adding a manual event is a pure
 * write — no geocoding, no weather, no AI — so `placeText` is stored raw and the
 * geocoded fields stay null until a later, consent-gated step fills them.
 */
export const plannedEventCreateSchema = z
  .object({
    title: plannedEventTitle,
    occasion: plannedEventOccasionWire,
    allDay: z.boolean().default(false),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).optional(),
    placeText: plannedEventPlaceWire,
  })
  .refine(
    (value) =>
      value.endsAt === undefined ||
      new Date(value.endsAt).getTime() >= new Date(value.startsAt).getTime(),
    { message: PLANNED_EVENT_END_BEFORE_START, path: ["endsAt"] },
  );

export type PlannedEventCreateInput = z.infer<typeof plannedEventCreateSchema>;

/* -------------------------------------------------------------------------- */
/*                 Outfit Calendar — Google read-only import                  */
/* -------------------------------------------------------------------------- */

/**
 * What crosses the wire to `POST /api/aura/calendar/google` (trigger a sync).
 * The client sends the instant that is start-of-today in the viewer's timezone,
 * so the forward-only window is bounded exactly at the viewer's civil "today"
 * (the same day-granular active/past boundary the agenda uses). It is optional
 * and offset-bearing; the route falls back to the current instant when it is
 * absent — never importing anything already in the past for the viewer.
 */
export const googleCalendarSyncSchema = z.object({
  startOfToday: z.iso.datetime({ offset: true }).optional(),
});

export type GoogleCalendarSyncInput = z.infer<typeof googleCalendarSyncSchema>;

/* -------------------------------------------------------------------------- */
/*                    Outfit Calendar — style preference                      */
/* -------------------------------------------------------------------------- */

/** The soft cap on the free-text style preference — enforced HERE (form + wire),
 *  never on the `StylePreference.text` DB column, which stays uncapped. A sentence
 *  or two is the intent; this keeps a run-on from becoming the whole prompt. */
export const STYLE_PREFERENCE_MAX_LENGTH = 200;

const STYLE_PREFERENCE_TOO_LONG = "Keep it to a sentence or two";

// The preference is optional and empty-tolerant: a blank field is a legitimate
// value meaning "no preference". The route treats an empty string as a clear
// (the row is removed), so the participant returns to the absent state the
// planner simply omits — never a stored empty string masquerading as a signal.
const stylePreferenceText = z
  .string()
  .trim()
  .max(STYLE_PREFERENCE_MAX_LENGTH, STYLE_PREFERENCE_TOO_LONG);

/**
 * The single policy for the style preference, shared by the browser form and the
 * `PUT /api/aura/calendar/style-preference` wire. One free-text field, soft-capped
 * here (never on the DB column), so the counter the form shows and the limit the
 * server holds can't drift. Unlike the event/profile schemas — where the form
 * (Files / local datetimes) and the wire (data URIs / ISO instants) genuinely
 * differ — capture and submission are byte-identical here, so one schema serves
 * both. An empty `text` is valid and clears the preference.
 */
export const stylePreferenceSchema = z.object({
  text: stylePreferenceText,
});

export type StylePreferenceInput = z.infer<typeof stylePreferenceSchema>;
