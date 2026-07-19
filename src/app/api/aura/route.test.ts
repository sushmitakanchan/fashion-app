import { beforeEach, describe, expect, it, mock } from "bun:test";

import {
  AVATAR_PHOTO_ANGLES,
  AURA_REFERENCE_PHOTO_ANGLES,
  MAX_PHOTO_BYTES,
  type PhotoAngle,
} from "@/lib/validations";

/**
 * Route-level tests for live AURA submission.
 *
 * The seam under test is `POST /api/aura` itself, not its internals: the
 * integrations it orchestrates (Clerk, Cloudinary, Prisma) are stubbed at the
 * module boundary so every branch a real submission can take — unauthorized,
 * invalid, unconfigured, upload failure, persistence failure, success — is
 * observable as a response plus whatever it did or didn't persist.
 *
 * Note that `mock.module` patches the module registry for the whole test
 * process, not just this file. Any future test that wants the real
 * `@/lib/prisma`, `@/lib/cloudinary`, `@/lib/aura-config`, or Clerk must run in
 * its own file *and* not share a process with this one.
 */

/* -------------------------------------------------------------------------- */
/*                                   Stubs                                    */
/* -------------------------------------------------------------------------- */

type UploadOptions = { public_id: string; overwrite: boolean };
type UploadStub = (
  file: string,
  options: UploadOptions,
) => Promise<{ secure_url: string }>;
type UpsertArgs = {
  where: Record<string, string>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
};
type UpsertStub = (args: UpsertArgs) => Promise<{ id: string }>;

let live = true;
let userId: string | null = "clerk_user_1";
let clerkUser: {
  emailAddresses: {
    emailAddress: string;
    verification: { status: "verified" | "unverified" };
  }[];
  externalAccounts: {
    provider: "google" | "github";
    emailAddress: string;
    firstName: string;
    lastName: string;
    verification: { status: "verified" | "unverified" };
  }[];
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
} | null = null;

const profiles = new Map<string, Record<string, unknown> & { id: string }>();

let upload: ReturnType<typeof mock<UploadStub>>;
let userUpsert: ReturnType<typeof mock<UpsertStub>>;
let auraUpsert: ReturnType<typeof mock<UpsertStub>>;

mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE:
    "AURA isn't configured to save profiles or generate portraits. Please try again later.",
  isAuraLiveConfigured: () => live,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => clerkUser,
}));

mock.module("@/lib/cloudinary", () => ({
  cloudinary: {
    uploader: {
      upload: (file: string, options: UploadOptions) => upload(file, options),
    },
  },
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { upsert: (args: UpsertArgs) => userUpsert(args) },
    auraProfile: { upsert: (args: UpsertArgs) => auraUpsert(args) },
  }),
}));

const { POST } = await import("./route");

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

const photo = (angle: PhotoAngle) =>
  `data:image/jpeg;base64,${Buffer.from(angle).toString("base64")}`;

/** The demographic/body-profile fields this contract no longer accepts. */
const RETIRED_PROFILE_FIELDS = [
  "age",
  "gender",
  "heightCm",
  "weightKg",
  "bodyType",
];

const validBody = () => ({
  name: "Ada Lovelace",
  consent: true,
  photos: Object.fromEntries(
    AURA_REFERENCE_PHOTO_ANGLES.map((angle) => [angle, photo(angle)]),
  ) as Record<"front" | "closeup", string>,
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/aura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  live = true;
  userId = "clerk_user_1";
  clerkUser = {
    emailAddresses: [
      { emailAddress: "ada@example.com", verification: { status: "verified" } },
    ],
    externalAccounts: [
      {
        provider: "google",
        emailAddress: "ada@example.com",
        firstName: "Ada",
        lastName: "Lovelace",
        verification: { status: "verified" },
      },
    ],
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: "https://img.clerk.test/ada.png",
  };

  upload = mock(async (_file: string, options: { public_id: string }) => ({
    secure_url: `https://res.cloudinary.test/v1/${options.public_id}.jpg`,
  }));
  userUpsert = mock(async () => ({ id: "db_user_1" }));

  // Modelled as a store keyed the way the real unique constraint is, so
  // "creates *or replaces*" is observable rather than merely asserted about
  // the arguments: a second submission has to land on the same row.
  profiles.clear();
  auraUpsert = mock(async ({ where, create, update }: UpsertArgs) => {
    const existing = profiles.get(where.userId);
    profiles.set(where.userId, {
      id: existing?.id ?? `aura_${profiles.size + 1}`,
      ...(existing ? { ...existing, ...update } : create),
    });
    return { id: profiles.get(where.userId)!.id as string };
  });
});

/* -------------------------------------------------------------------------- */
/*                              Refused up front                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — refused submissions", () => {
  it("refuses unavailable configuration without persisting or describing a local result", async () => {
    live = false;

    const response = await post(validBody());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "AURA isn't configured to save profiles or generate portraits. Please try again later.",
    });
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller, without persisting", async () => {
    userId = null;

    const response = await post(validBody());

    expect(response.status).toBe(401);
    expect(upload).not.toHaveBeenCalled();
    expect(userUpsert).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("returns unauthorized before reporting unavailable live services", async () => {
    live = false;
    userId = null;

    const response = await post(validBody());

    expect(response.status).toBe(401);
    expect(userUpsert).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("rejects a non-Google identity before external operations", async () => {
    clerkUser = {
      ...clerkUser!,
      externalAccounts: [{ ...clerkUser!.externalAccounts[0], provider: "github" }],
    };

    const response = await post(validBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Your AURA profile requires a linked Google account.",
    });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("rejects an unverified Google email before external operations", async () => {
    clerkUser = {
      ...clerkUser!,
      emailAddresses: [
        { ...clerkUser!.emailAddresses[0], verification: { status: "unverified" } },
      ],
    };

    const response = await post(validBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Verify your Google email before saving an AURA profile.",
    });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("returns the validation issues for an invalid payload, without persisting", async () => {
    const response = await post({ ...validBody(), name: " ", consent: false });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues?: { path: string[] }[] };
    expect(body.issues?.map((issue) => issue.path[0]).sort()).toEqual([
      "consent",
      "name",
    ]);
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it.each(RETIRED_PROFILE_FIELDS)(
    "refuses a submission carrying the retired %s field, without persisting",
    async (field) => {
      const response = await post({ ...validBody(), [field]: 42 });

      expect(response.status).toBe(400);
      expect(upload).not.toHaveBeenCalled();
      expect(userUpsert).not.toHaveBeenCalled();
      expect(auraUpsert).not.toHaveBeenCalled();
    },
  );

  it("refuses an unsupported photo type, without persisting", async () => {
    const body = validBody();

    const response = await post({
      ...body,
      photos: { ...body.photos, front: "data:image/gif;base64,AAAA" },
    });

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("refuses a photo whose decoded size exceeds the limit, without persisting", async () => {
    const body = validBody();
    // Encoded client-side checks are bypassable; the server measures the photo.
    const oversized = `data:image/jpeg;base64,${Buffer.from(
      new Uint8Array(MAX_PHOTO_BYTES + 1),
    ).toString("base64")}`;

    const response = await post({
      ...body,
      photos: { ...body.photos, front: oversized },
    });

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("requires both AURA portrait reference photos, without persisting", async () => {
    const body = validBody();
    delete (body.photos as Partial<Record<PhotoAngle, string>>).closeup;

    const response = await post(body);

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      issues?: { path: string[] }[];
    };
    expect(payload.issues?.some((issue) => issue.path.join(".") === "photos.closeup")).toBe(
      true,
    );
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed body, without persisting", async () => {
    const response = await POST(
      new Request("http://localhost/api/aura", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("refuses an account with no verified Google email, without persisting", async () => {
    clerkUser = { ...clerkUser!, emailAddresses: [] };

    const response = await post(validBody());

    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*                             A live submission                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — a valid live submission", () => {
  it("stores the two required AURA reference photos with deterministic ids", async () => {
    await post(validBody());

    expect(upload).toHaveBeenCalledTimes(AURA_REFERENCE_PHOTO_ANGLES.length);
    const options = upload.mock.calls.map(([, opts]) => opts);

    expect(options.map((opts) => opts.public_id)).toEqual(
      AURA_REFERENCE_PHOTO_ANGLES.map(
        (angle) => `fashion-app/aura/clerk_user_1/${angle}`,
      ),
    );
    // Overwriting is what keeps a re-save from orphaning the old assets.
    expect(options.every((opts) => opts.overwrite)).toBe(true);
  });

  it("creates a profile from just the two AURA reference photos", async () => {
    const response = await post(validBody());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "aura_1" });

    const profile = profiles.get("db_user_1");
    expect(profile).toMatchObject({
      userId: "db_user_1",
      name: "Ada Lovelace",
      photoFrontUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/front.jpg",
      photoCloseupUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/closeup.jpg",
      photoLeftUrl: null,
      photoRightUrl: null,
      photoBackUrl: null,
    });
    expect(profile?.consentedAt).toBeInstanceOf(Date);
    // The retired columns are gone from the model, so the route must not be
    // writing them under any name.
    expect(
      Object.keys(profile!).filter((key) =>
        RETIRED_PROFILE_FIELDS.includes(key),
      ),
    ).toEqual([]);
  });

  it("refreshes the consent timestamp on every successful save", async () => {
    await post(validBody());
    const first = profiles.get("db_user_1")!.consentedAt as Date;

    // The stub store records whatever the route wrote; a same-millisecond
    // re-save would make "refreshed" indistinguishable from "untouched".
    await Bun.sleep(2);
    await post(validBody());
    const second = profiles.get("db_user_1")!.consentedAt as Date;

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it("retains supplied optional 3D avatar references", async () => {
    const first = await post({
      ...validBody(),
      photos: {
        ...validBody().photos,
        left: photo("left"),
        right: photo("right"),
        back: photo("back"),
      },
    });

    expect(first.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(
      AURA_REFERENCE_PHOTO_ANGLES.length + AVATAR_PHOTO_ANGLES.length,
    );
    expect(profiles.get("db_user_1")).toMatchObject({
      photoLeftUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/left.jpg",
      photoRightUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/right.jpg",
      photoBackUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/back.jpg",
    });

    const second = await post({ ...validBody(), name: "Ada L." });

    expect(second.status).toBe(201);
    expect(profiles.get("db_user_1")).toMatchObject({
      name: "Ada L.",
      photoLeftUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/left.jpg",
      photoRightUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/right.jpg",
      photoBackUrl:
        "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/back.jpg",
    });
  });

  it("replaces the profile on regeneration rather than adding a second", async () => {
    const first = await post(validBody());
    const second = await post({ ...validBody(), name: "Ada L." });

    expect(second.status).toBe(201);
    // One row, still the same one — regeneration must not duplicate.
    expect(profiles.size).toBe(1);
    await expect(second.json()).resolves.toEqual(await first.json());

    expect(profiles.get("db_user_1")).toMatchObject({ name: "Ada L." });
    // Two assets, not four: the deterministic ids were overwritten in place.
    expect(new Set(upload.mock.calls.map(([, opts]) => opts.public_id)).size).toBe(
      AURA_REFERENCE_PHOTO_ANGLES.length,
    );
  });

  it("keeps an existing portrait when profile data is replaced", async () => {
    await post(validBody());
    profiles.set("db_user_1", {
      ...profiles.get("db_user_1")!,
      portraitUrl: "https://res.cloudinary.test/aura-portrait.jpg",
    });

    const response = await post({ ...validBody(), name: "Ada L." });

    expect(response.status).toBe(201);
    expect(profiles.get("db_user_1")).toMatchObject({
      name: "Ada L.",
      portraitUrl: "https://res.cloudinary.test/aura-portrait.jpg",
    });
  });
});

/* -------------------------------------------------------------------------- */
/*                            Failures mid-flight                             */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — failures never report success", () => {
  it("does not persist a profile when a photo upload fails", async () => {
    upload = mock(async (_file: string, options: { public_id: string }) => {
      if (options.public_id.endsWith("/closeup")) throw new Error("Cloudinary 500");
      return { secure_url: `https://res.cloudinary.test/v1/${options.public_id}.jpg` };
    });

    const response = await post(validBody());

    expect(response.ok).toBe(false);
    expect(auraUpsert).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toHaveProperty("error");
  });

  it("reports an actionable failure when mirroring the user fails", async () => {
    userUpsert = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const response = await post(validBody());

    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/try again/i);
    expect(auraUpsert).not.toHaveBeenCalled();
  });

  it("reports an actionable failure when saving the profile fails", async () => {
    auraUpsert = mock(async () => {
      throw new Error("write conflict");
    });

    const response = await post(validBody());

    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(500);
    const body = (await response.json()) as { error?: string };
    // The user has to know retrying is worth it — the five assets are
    // deterministic, so a retry overwrites rather than accumulates.
    expect(body.error).toMatch(/try again/i);
  });
});
