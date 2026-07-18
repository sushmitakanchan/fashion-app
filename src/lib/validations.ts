import { z } from "zod";

/**
 * Shared AURA Zod schemas. Because they live in a plain module they can be
 * reused on the client (React Hook Form) and on the server (Route Handlers /
 * actions).
 */

// Kept in the same order as the Prisma `Gender` / `BodyType` enums.
export const GENDERS = ["MALE", "FEMALE", "UNDISCLOSED"] as const;
export const BODY_TYPES = [
  "RECTANGLE",
  "TRIANGLE",
  "INVERTED_TRIANGLE",
  "HOURGLASS",
  "OVAL",
] as const;
/** The two photos that are required to save an AURA portrait profile. */
export const AURA_REFERENCE_PHOTO_ANGLES = ["front", "closeup"] as const;

/** Future 3D-avatar inputs. They are stored when supplied, never required. */
export const AVATAR_PHOTO_ANGLES = ["left", "right", "back"] as const;

/** Every profile photo field, in deterministic Cloudinary upload order. */
export const PHOTO_ANGLES = [
  "front",
  "closeup",
  "left",
  "right",
  "back",
] as const;

export type Gender = (typeof GENDERS)[number];
export type BodyType = (typeof BODY_TYPES)[number];
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Photos are downscaled to this long edge before upload. Phone cameras produce
// 4000px+ images; four of those base64-encoded would blow past the request body
// limit, and the extra detail is useless for fitting a twin.
export const PHOTO_MAX_EDGE = 1600;

// Height and weight are stored in metric no matter which units were typed, so
// the bounds live here once. Messages name both systems because the form lets
// you enter either and the error has to make sense in whichever you picked.
const heightCm = z
  .number({ error: "Enter your height" })
  .min(90, "Height must be between 90–250 cm (3′0″–8′2″)")
  .max(250, "Height must be between 90–250 cm (3′0″–8′2″)");

const weightKg = z
  .number({ error: "Enter your weight" })
  .min(30, "Weight must be between 30–300 kg (66–661 lb)")
  .max(300, "Weight must be between 30–300 kg (66–661 lb)");

const auraFields = {
  name: z
    .string({ error: "Please enter your name" })
    .trim()
    .min(2, "Please enter your name")
    .max(60, "That name is a little too long"),
  age: z
    .number({ error: "Enter your age" })
    .int("Age must be a whole number")
    .min(13, "You must be at least 13 to generate an AURA")
    .max(120, "Enter a valid age"),
  gender: z.enum(GENDERS, { error: "Select an option" }),
  heightCm,
  weightKg,
  bodyType: z.enum(BODY_TYPES, { error: "Select the closest body type" }),
  // Consent gates the submit button, so this is a backstop rather than the
  // primary check — but the server must not take our word for it.
  consent: z
    .boolean()
    .refine((v) => v === true, "Please agree before generating your AURA"),
};

const photoFile = z
  .instanceof(File, { error: "Add a photo" })
  .refine((f) => f.size <= MAX_PHOTO_BYTES, "Photo must be under 8 MB")
  .refine(
    (f) => ACCEPTED_PHOTO_TYPES.includes(f.type),
    "Use a JPEG, PNG, or WebP image",
  );

/** What the browser form holds: real `File`s, before any encoding. */
export const auraFormSchema = z.object({
  ...auraFields,
  photos: z.object({
    front: photoFile,
    closeup: photoFile,
    left: photoFile.optional(),
    right: photoFile.optional(),
    back: photoFile.optional(),
  }),
});

export type AuraFormInput = z.infer<typeof auraFormSchema>;

const photoDataUri = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Invalid photo");

/** What crosses the wire to `POST /api/aura`: photos as base64 data URIs. */
export const auraSubmissionSchema = z.object({
  ...auraFields,
  photos: z.object({
    front: photoDataUri,
    closeup: photoDataUri,
    left: photoDataUri.optional(),
    right: photoDataUri.optional(),
    back: photoDataUri.optional(),
  }),
});

export type AuraSubmissionInput = z.infer<typeof auraSubmissionSchema>;
