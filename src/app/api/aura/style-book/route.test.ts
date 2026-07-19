import { beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Route-level tests for `POST /api/aura/style-book`.
 *
 * The seam under test is the handler itself: Clerk, Cloudinary, and Prisma are
 * stubbed at the module boundary so every branch a real save can take — the
 * whole gate ladder, upload-all-then-insert, insert-only immutability, inferred
 * provenance, and ownership scoping — is observable as a response plus what did
 * (or didn't) persist and how many uploads fired.
 *
 * Persistence is stubbed as a *store* (an append-only list), not a fixed return,
 * because "insert-only" and "scoped to the session owner" cannot be observed
 * from call arguments alone.
 *
 * `mock.module` patches the registry for the whole test process, so this file
 * must not share a process with one that needs the real `@/lib/prisma`,
 * `@/lib/cloudinary`, `@/lib/aura-config`, or Clerk.
 */

/* -------------------------------------------------------------------------- */
/*                                   Stubs                                    */
/* -------------------------------------------------------------------------- */

type CreateArgs = {
  data: {
    user: { connect: { clerkId: string } };
    lookImageUrl: string;
    caption: string;
    portraitUrl: string;
    sources: unknown;
  };
};

type SavedRow = {
  id: string;
  ownerClerkId: string;
  lookImageUrl: string;
  caption: string;
  portraitUrl: string;
  sources: { imageUrl: string; name: string; url?: string; site?: string }[];
  createdAt: Date;
};

let userId: string | null = "clerk_user_1";
let cloudinaryConfigured = true;
let databaseConfigured = true;
let profileRow: { consentedAt: Date; portraitUrl: string | null } | null = null;

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

const savedLooks: SavedRow[] = [];

let uploadImage: ReturnType<
  typeof mock<(file: string, folder: string) => Promise<{ secure_url: string }>>
>;
let userFindUnique: ReturnType<
  typeof mock<() => Promise<{ auraProfile: typeof profileRow } | null>>
>;
let savedLookCreate: ReturnType<
  typeof mock<(args: CreateArgs) => Promise<Record<string, unknown>>>
>;

// `mock.module` patches the aura-config module for the whole process, and the
// sibling route tests (which link `isAuraLiveConfigured`) share it. Export the
// full surface every route imports so no file's route fails to link against
// whichever mock is active — each route still reads the variables its own
// file drives.
mock.module("@/lib/aura-config", () => ({
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE:
    "AURA isn't configured to save profiles or generate portraits. Please try again later.",
  isCloudinaryConfigured: () => cloudinaryConfigured,
  isDatabaseConfigured: () => databaseConfigured,
  isAuraLiveConfigured: () => cloudinaryConfigured && databaseConfigured,
}));

mock.module("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId }),
  currentUser: async () => clerkUser,
}));

mock.module("@/lib/cloudinary", () => ({
  uploadImage: (file: string, folder: string) => uploadImage(file, folder),
  // Not used by this route; present only so a sibling route that links the raw
  // `cloudinary` client can resolve against this process-wide mock.
  cloudinary: {
    uploader: {
      upload: async () => {
        throw new Error("cloudinary.uploader is not stubbed for this route test");
      },
    },
  },
}));

mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique: () => userFindUnique() },
    savedLook: { create: (args: CreateArgs) => savedLookCreate(args) },
  }),
}));

const { POST } = await import("./route");

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

// A data URI whose base64 payload decodes back to `label`, so the upload stub
// can echo the label into the secure URL and a test can assert the exact
// look/source → URL mapping regardless of concurrent upload order.
const labeledUri = (label: string) =>
  `data:image/jpeg;base64,${Buffer.from(label).toString("base64")}`;

const labelOf = (file: string) =>
  Buffer.from(file.slice(file.indexOf(",") + 1), "base64").toString("utf8");

const urlFor = (label: string) =>
  `https://res.cloudinary.test/fashion-app/style-book/clerk_user_1/${label}.jpg`;

const uploadSource = (name = "Linen shirt", label = "shirt") => ({
  image: labeledUri(label),
  name,
});

const linkSource = (name = "Wide-leg trousers", label = "trousers") => ({
  image: labeledUri(label),
  name,
  url: "https://www.myntra.com/trousers/brand/12345/buy",
  site: "myntra" as const,
});

const validBody = () => ({ look: labeledUri("look"), sources: [uploadSource()] });

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/aura/style-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  userId = "clerk_user_1";
  cloudinaryConfigured = true;
  databaseConfigured = true;
  profileRow = {
    consentedAt: new Date("2026-01-01T00:00:00Z"),
    portraitUrl: "https://res.cloudinary.test/aura-portrait.jpg",
  };
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

  uploadImage = mock(async (file: string, folder: string) => ({
    secure_url: `https://res.cloudinary.test/${folder}/${labelOf(file)}.jpg`,
  }));

  userFindUnique = mock(async () => ({ auraProfile: profileRow }));

  savedLooks.length = 0;
  savedLookCreate = mock(async ({ data }: CreateArgs) => {
    const row: SavedRow = {
      id: `look_${savedLooks.length + 1}`,
      ownerClerkId: data.user.connect.clerkId,
      lookImageUrl: data.lookImageUrl,
      caption: data.caption,
      portraitUrl: data.portraitUrl,
      sources: data.sources as SavedRow["sources"],
      createdAt: new Date("2026-07-19T00:00:00Z"),
    };
    savedLooks.push(row);
    return {
      id: row.id,
      caption: row.caption,
      lookImageUrl: row.lookImageUrl,
      createdAt: row.createdAt,
    };
  });
});

/* -------------------------------------------------------------------------- */
/*                        The gate ladder, refused up front                   */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura/style-book — the gate ladder", () => {
  it("rejects an unauthenticated caller before anything else", async () => {
    userId = null;
    // Even with everything else broken, 401 wins.
    cloudinaryConfigured = false;

    const response = await post(validBody());

    expect(response.status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });

  it("rejects a non-Google identity before touching the database", async () => {
    clerkUser = {
      ...clerkUser!,
      externalAccounts: [
        { ...clerkUser!.externalAccounts[0], provider: "github" },
      ],
    };

    const response = await post(validBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "identity-refused",
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled();
  });

  it("refuses a participant without a consented AURA profile", async () => {
    profileRow = null;

    const response = await post(validBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "consent-required",
    });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });

  it("refuses when persistence is unconfigured, gating on Cloudinary + DB only", async () => {
    cloudinaryConfigured = false;

    const response = await post(validBody());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "configuration-unavailable",
    });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });

  it("saves without any OpenAI image key configured — a save calls no model", async () => {
    // The route deliberately drops try-on's OpenAI-image-key check: the config
    // stub exposes only Cloudinary + DB, and a save still succeeds.
    const response = await post(validBody());

    expect(response.status).toBe(201);
    expect(savedLookCreate).toHaveBeenCalledTimes(1);
  });

  it("returns validation issues for an invalid payload, without persisting", async () => {
    const response = await post({ look: labeledUri("look"), sources: [] });

    expect(response.status).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-JSON) body, without persisting", async () => {
    const response = await POST(
      new Request("http://localhost/api/aura/style-book", {
        method: "POST",
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*                            Failures mid-flight                             */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura/style-book — failures never report success", () => {
  it("does not insert when an image upload fails", async () => {
    uploadImage = mock(async (file: string) => {
      if (labelOf(file) === "shirt") throw new Error("Cloudinary 500");
      return { secure_url: urlFor(labelOf(file)) };
    });

    const response = await post(validBody());

    expect(response.status).toBe(500);
    expect(savedLookCreate).not.toHaveBeenCalled();
    expect(savedLooks).toHaveLength(0);
  });

  it("reports an actionable failure when the insert fails", async () => {
    savedLookCreate = mock(async () => {
      throw new Error("write conflict");
    });

    const response = await post(validBody());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error?: string; retryable?: boolean };
    expect(body.error).toMatch(/try again/i);
    expect(body.retryable).toBe(true);
    expect(savedLooks).toHaveLength(0);
  });

  it("reports a failure when the consent lookup itself throws", async () => {
    userFindUnique = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    });

    const response = await post(validBody());

    expect(response.status).toBe(500);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(savedLookCreate).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*                            A valid live save                               */
/* -------------------------------------------------------------------------- */

describe("POST /api/aura/style-book — a valid save", () => {
  it("uploads exactly 1 look + N source images, then a single insert", async () => {
    const response = await post({
      look: labeledUri("look"),
      sources: [uploadSource(), linkSource()],
    });

    expect(response.status).toBe(201);
    // 1 look + 2 sources.
    expect(uploadImage).toHaveBeenCalledTimes(3);
    expect(savedLookCreate).toHaveBeenCalledTimes(1);
    // Every asset lands in the per-owner Style Book folder.
    for (const [, folder] of uploadImage.mock.calls) {
      expect(folder).toBe("fashion-app/style-book/clerk_user_1");
    }
  });

  it("stores the returned secure URLs, the portrait snapshot, and a derived caption", async () => {
    const response = await post({
      look: labeledUri("look"),
      sources: [uploadSource("Linen shirt", "shirt"), linkSource("Trousers", "trousers")],
    });

    await expect(response.json()).resolves.toMatchObject({
      id: "look_1",
      caption: "Linen shirt & Trousers",
      lookImageUrl: urlFor("look"),
    });

    const saved = savedLooks[0];
    expect(saved.lookImageUrl).toBe(urlFor("look"));
    expect(saved.sources.map((s) => s.imageUrl)).toEqual([
      urlFor("shirt"),
      urlFor("trousers"),
    ]);
    // The portrait is copied verbatim, never re-uploaded.
    expect(saved.portraitUrl).toBe("https://res.cloudinary.test/aura-portrait.jpg");
    expect(saved.caption).toBe("Linen shirt & Trousers");
  });

  it("infers provenance at the boundary and writes no kind discriminator", async () => {
    await post({
      look: labeledUri("look"),
      sources: [uploadSource("Cap", "cap"), linkSource("Skirt", "skirt")],
    });

    const [upload, link] = savedLooks[0].sources;

    // Upload: no url/site, and crucially no `kind`.
    expect(upload).toEqual({ imageUrl: urlFor("cap"), name: "Cap" });
    expect("kind" in upload).toBe(false);

    // Link: url + site retained; still no `kind`.
    expect(link).toEqual({
      imageUrl: urlFor("skirt"),
      name: "Skirt",
      url: "https://www.myntra.com/trousers/brand/12345/buy",
      site: "myntra",
    });
    expect("kind" in link).toBe(false);
  });

  it("is insert-only: two saves create two rows", async () => {
    await post(validBody());
    await post(validBody());

    expect(savedLookCreate).toHaveBeenCalledTimes(2);
    expect(savedLooks).toHaveLength(2);
    expect(savedLooks.map((row) => row.id)).toEqual(["look_1", "look_2"]);
  });

  it("scopes the insert to the session owner", async () => {
    await post(validBody());
    expect(savedLooks[0].ownerClerkId).toBe("clerk_user_1");

    // A different session writes under its own ownership, never the first's.
    userId = "clerk_user_2";
    await post(validBody());
    expect(savedLooks[1].ownerClerkId).toBe("clerk_user_2");
  });
});
