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

const auraFields = {
  // The AURA display name. It belongs to the AURA profile, not to the Google or
  // Clerk account it was seeded from, so editing it never travels back upstream.
  name: z
    .string({ error: "Please enter your name" })
    .trim()
    .min(2, "Please enter your name")
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
const photoDataUri = z
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

// A garment/source name — one policy shared by the try-on garment and the
// Style Book save source, so the 80-char cap can never drift between the two.
const garmentName = z
  .string({ error: "Name the garment" })
  .trim()
  .min(1, "Name the garment")
  .max(80, "That name is a little too long");

const tryOnGarment = z.object({
  // The untrusted upload crosses the wire exactly like a profile photo. The
  // regex enforces MIME + base64 shape here; the generator re-validates decoded
  // size/decodability at its boundary (`invalid-garment`).
  image: photoDataUri,
  name: garmentName,
});

/** What crosses the wire to `POST /api/aura/try-on`: one-or-more garments. */
export const auraTryOnSchema = z.object({
  garments: z
    .array(tryOnGarment)
    .min(1, "Attach at least one garment")
    .max(MAX_TRY_ON_GARMENTS, `Attach up to ${MAX_TRY_ON_GARMENTS} garments`),
});

export type AuraTryOnInput = z.infer<typeof auraTryOnSchema>;
export type AuraTryOnGarment = z.infer<typeof tryOnGarment>;

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
