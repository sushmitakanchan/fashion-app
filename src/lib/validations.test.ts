import { describe, expect, it } from "bun:test";

import {
  auraFormSchema,
  auraSubmissionSchema,
  MAX_PHOTO_BYTES,
} from "@/lib/validations";

/**
 * The shared AURA contract, exercised at both boundaries it has to hold at:
 * the browser form (real `File`s) and the wire submission (base64 data URIs).
 *
 * These assert accept/reject outcomes and which field failed — never how the
 * schema is built — so the same tests keep meaning if the Zod shape changes.
 */

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

const file = (
  { type = "image/jpeg", bytes = 1024 }: { type?: string; bytes?: number } = {},
) => new File([new Uint8Array(bytes)], "photo", { type });

/** A data URI whose *decoded* payload is exactly `bytes` long. */
const dataUri = (
  { type = "jpeg", bytes = 1024 }: { type?: string; bytes?: number } = {},
) =>
  `data:image/${type};base64,${Buffer.from(new Uint8Array(bytes)).toString("base64")}`;

const validForm = () => ({
  name: "Ada Lovelace",
  consent: true,
  photos: { front: file(), closeup: file() },
});

const validSubmission = () => ({
  name: "Ada Lovelace",
  consent: true,
  photos: { front: dataUri(), closeup: dataUri() },
});

/** The field paths a failed parse blames, so a test can name the cause. */
const failedPaths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

/* -------------------------------------------------------------------------- */
/*                          Shared across both sides                          */
/* -------------------------------------------------------------------------- */

describe.each([
  ["browser form", auraFormSchema, validForm, file, MAX_PHOTO_BYTES + 1],
  [
    "wire submission",
    auraSubmissionSchema,
    validSubmission,
    dataUri,
    MAX_PHOTO_BYTES + 1,
  ],
] as const)("the AURA %s contract", (_label, schema, valid, photo, oversized) => {
  it("accepts a minimal profile: a name, consent, and the two references", () => {
    expect(schema.safeParse(valid()).success).toBe(true);
  });

  it("accepts the optional 3D avatar references alongside the required two", () => {
    const input = valid();
    const result = schema.safeParse({
      ...input,
      photos: {
        ...input.photos,
        left: photo(),
        right: photo(),
        back: photo(),
      },
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["a single character", "A"],
    ["whitespace only", "   "],
    ["longer than 60 characters", "a".repeat(61)],
  ])("rejects a display name that is %s", (_case, name) => {
    const result = schema.safeParse({ ...valid(), name });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("name");
  });

  it("trims a display name that is padded with whitespace", () => {
    const result = schema.safeParse({ ...valid(), name: "  Ada Lovelace  " });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Ada Lovelace");
  });

  it.each([false, undefined])("rejects consent of %p", (consent) => {
    const result = schema.safeParse({ ...valid(), consent });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("consent");
  });

  it.each(["front", "closeup"] as const)(
    "requires the %s AURA reference photo",
    (angle) => {
      const input = valid();
      delete (input.photos as Record<string, unknown>)[angle];

      const result = schema.safeParse(input);

      expect(result.success).toBe(false);
      expect(failedPaths(result)).toContain(`photos.${angle}`);
    },
  );

  it("rejects a photo larger than the 15 MiB limit", () => {
    const input = valid();
    const result = schema.safeParse({
      ...input,
      photos: { ...input.photos, front: photo({ bytes: oversized }) },
    });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("photos.front");
  });

  it("accepts a photo exactly at the 15 MiB limit", () => {
    const input = valid();
    const result = schema.safeParse({
      ...input,
      photos: { ...input.photos, front: photo({ bytes: MAX_PHOTO_BYTES }) },
    });

    expect(result.success).toBe(true);
  });

  it.each(["age", "gender", "heightCm", "weightKg", "bodyType", "units"])(
    "rejects the retired %s field as unknown input",
    (field) => {
      const result = schema.safeParse({ ...valid(), [field]: 1 });

      expect(result.success).toBe(false);
    },
  );

  it("rejects an unknown photo angle", () => {
    const input = valid();
    const result = schema.safeParse({
      ...input,
      photos: { ...input.photos, side: photo() },
    });

    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*                        Boundary-specific photo rules                       */
/* -------------------------------------------------------------------------- */

describe("the AURA browser form contract", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts a %s file",
    (type) => {
      const input = validForm();
      const result = auraFormSchema.safeParse({
        ...input,
        photos: { ...input.photos, front: file({ type }) },
      });

      expect(result.success).toBe(true);
    },
  );

  it.each(["image/gif", "image/heic", "application/pdf"])(
    "rejects a %s file",
    (type) => {
      const input = validForm();
      const result = auraFormSchema.safeParse({
        ...input,
        photos: { ...input.photos, front: file({ type }) },
      });

      expect(result.success).toBe(false);
      expect(failedPaths(result)).toContain("photos.front");
    },
  );

  it("rejects a data URI where the form expects a file", () => {
    const input = validForm();
    const result = auraFormSchema.safeParse({
      ...input,
      photos: { ...input.photos, front: dataUri() },
    });

    expect(result.success).toBe(false);
  });
});

describe("the AURA wire submission contract", () => {
  it.each(["jpeg", "png", "webp"])("accepts an image/%s data URI", (type) => {
    const input = validSubmission();
    const result = auraSubmissionSchema.safeParse({
      ...input,
      photos: { ...input.photos, front: dataUri({ type }) },
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["an unsupported image type", "data:image/gif;base64,AAAA"],
    ["a non-image media type", "data:application/pdf;base64,AAAA"],
    ["a remote URL instead of image data", "https://example.com/photo.jpg"],
    ["a bare base64 payload with no media type", "AAAA"],
    ["a URI with no base64 payload", "data:image/jpeg;base64,"],
    ["base64 with characters outside the alphabet", "data:image/jpeg;base64,!!!!"],
  ])("rejects %s", (_case, value) => {
    const input = validSubmission();
    const result = auraSubmissionSchema.safeParse({
      ...input,
      photos: { ...input.photos, front: value },
    });

    expect(result.success).toBe(false);
    expect(failedPaths(result)).toContain("photos.front");
  });

  it("rejects a File where the wire expects a data URI", () => {
    const input = validSubmission();
    const result = auraSubmissionSchema.safeParse({
      ...input,
      photos: { ...input.photos, front: file() },
    });

    expect(result.success).toBe(false);
  });

  it("measures decoded bytes, not the encoded string length", () => {
    // Base64 inflates by ~4/3, so a payload whose *encoded* length exceeds the
    // limit can still decode to an acceptable photo. The limit is on the photo.
    const bytes = MAX_PHOTO_BYTES - 1024;
    const photo = dataUri({ bytes });
    expect(photo.length).toBeGreaterThan(MAX_PHOTO_BYTES);

    const input = validSubmission();
    const result = auraSubmissionSchema.safeParse({
      ...input,
      photos: { ...input.photos, front: photo },
    });

    expect(result.success).toBe(true);
  });
});
