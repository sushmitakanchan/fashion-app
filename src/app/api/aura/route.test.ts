import { beforeEach, describe, expect, it, mock } from "bun:test";

import { PHOTO_ANGLES, type PhotoAngle } from "@/lib/validations";

/**
 * Route-level tests for live AURA submission.
 *
 * The seam under test is `POST /api/aura` itself, not its internals: the
 * integrations it orchestrates (Clerk, Cloudinary, Prisma) are stubbed at the
 * module boundary so every branch a real submission can take — unauthorized,
 * invalid, unconfigured, upload failure, persistence failure, success — is
 * observable as a response plus whatever it did or didn't persist.
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
  emailAddresses: { emailAddress: string }[];
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
} | null = null;

let upload: ReturnType<typeof mock<UploadStub>>;
let userUpsert: ReturnType<typeof mock<UpsertStub>>;
let auraUpsert: ReturnType<typeof mock<UpsertStub>>;

mock.module("@/lib/aura-config", () => ({
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

const validBody = () => ({
  name: "Ada Lovelace",
  age: 36,
  gender: "FEMALE",
  heightCm: 168,
  weightKg: 61,
  bodyType: "HOURGLASS",
  consent: true,
  photos: Object.fromEntries(
    PHOTO_ANGLES.map((angle) => [angle, photo(angle)]),
  ) as Record<PhotoAngle, string>,
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
    emailAddresses: [{ emailAddress: "ada@example.com" }],
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: "https://img.clerk.test/ada.png",
  };

  upload = mock(async (_file: string, options: { public_id: string }) => ({
    secure_url: `https://res.cloudinary.test/v1/${options.public_id}.jpg`,
  }));
  userUpsert = mock(async () => ({ id: "db_user_1" }));
  auraUpsert = mock(async () => ({ id: "aura_1" }));
});

/* -------------------------------------------------------------------------- */
/*                              Refused up front                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — refused submissions", () => {
  it("refuses when live integrations are not configured, without persisting", async () => {
    live = false;

    const response = await post(validBody());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toHaveProperty("error");
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

  it("returns the validation issues for an invalid payload, without persisting", async () => {
    const response = await post({ ...validBody(), age: 9, consent: false });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues?: { path: string[] }[] };
    expect(body.issues?.map((issue) => issue.path[0]).sort()).toEqual([
      "age",
      "consent",
    ]);
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

  it("explains an account with no email address, without persisting", async () => {
    clerkUser = { ...clerkUser!, emailAddresses: [] };

    const response = await post(validBody());

    expect(response.status).toBe(422);
    expect(upload).not.toHaveBeenCalled();
    expect(auraUpsert).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*                             A live submission                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — a valid live submission", () => {
  it("stores five deterministic per-angle assets that overwrite the previous ones", async () => {
    await post(validBody());

    expect(upload).toHaveBeenCalledTimes(PHOTO_ANGLES.length);
    const options = upload.mock.calls.map(([, opts]) => opts);

    expect(options.map((opts) => opts.public_id)).toEqual(
      PHOTO_ANGLES.map((angle) => `fashion-app/aura/clerk_user_1/${angle}`),
    );
    // Overwriting is what keeps regeneration from orphaning the old five.
    expect(options.every((opts) => opts.overwrite)).toBe(true);
  });

  it("creates or replaces exactly one profile, holding the uploaded URLs", async () => {
    const response = await post(validBody());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "aura_1" });

    expect(auraUpsert).toHaveBeenCalledTimes(1);
    const [args] = auraUpsert.mock.calls[0];

    // Keyed on the one-per-user relation, so a second submission replaces
    // rather than duplicates.
    expect(args.where).toEqual({ userId: "db_user_1" });
    expect(args.update.photoFrontUrl).toBe(
      "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/front.jpg",
    );
    expect(args.update.photoBackUrl).toBe(
      "https://res.cloudinary.test/v1/fashion-app/aura/clerk_user_1/back.jpg",
    );
    expect(args.update.heightCm).toBe(168);
    expect(args.create).toMatchObject({ userId: "db_user_1", name: "Ada Lovelace" });
    expect(args.update.consentedAt).toBeInstanceOf(Date);
  });
});

/* -------------------------------------------------------------------------- */
/*                            Failures mid-flight                             */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura — failures never report success", () => {
  it("does not persist a profile when a photo upload fails", async () => {
    upload = mock(async (_file: string, options: { public_id: string }) => {
      if (options.public_id.endsWith("/right")) throw new Error("Cloudinary 500");
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
