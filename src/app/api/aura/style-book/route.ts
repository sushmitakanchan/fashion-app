import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isCloudinaryConfigured,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { deriveLookCaption, type SavedLookSource } from "@/lib/aura-style-book";
import { uploadImage } from "@/lib/cloudinary";
import { getPrisma } from "@/lib/prisma";
import { styleBookSaveSchema } from "@/lib/validations";

type Failure = {
  code: string;
  error: string;
  retryable: boolean;
};

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

// The one failure a participant can only retry, not fix: an upload or the
// insert didn't land. Insert is the single commit point, so a failure here
// leaves no Saved Look — the earlier uploads simply orphan (accepted in v1),
// and retrying is always safe.
const SAVE_FAILED = "We couldn't save your look. Please try again.";

const STYLE_BOOK_FOLDER = "fashion-app/style-book";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, {
      code: "unauthorized",
      error: "Unauthorized",
      retryable: false,
    });
  }

  // The same owner-only AURA trust boundary as try-on: a valid Clerk session is
  // not enough — only a linked, verified Google account may save.
  const clerkUser = await currentUser();
  const admission = clerkUser && admitGoogleAuraIdentity(clerkUser);
  if (!admission?.ok) {
    return failure(403, {
      code: "identity-refused",
      error: admission?.error ?? "We couldn't verify your Google identity.",
      retryable: false,
    });
  }

  // Consent gate — reuse the consent captured when the AURA profile was saved;
  // a saved look is a derivative of the already-consented portrait, so there is
  // no new consent moment, field, or per-look record. The same read yields the
  // portrait to snapshot, so the saved look stays faithful even after the
  // participant later regenerates their portrait.
  let prisma: ReturnType<typeof getPrisma>;
  let profile: { consentedAt: Date; portraitUrl: string | null } | null;
  try {
    prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        auraProfile: { select: { consentedAt: true, portraitUrl: true } },
      },
    });
    profile = user?.auraProfile ?? null;
  } catch (error) {
    console.error("Style Book profile lookup failed", error);
    return failure(500, {
      code: "profile-lookup-failed",
      error: SAVE_FAILED,
      retryable: true,
    });
  }

  if (!profile?.consentedAt) {
    return failure(403, {
      code: "consent-required",
      error: "Create your AURA profile before saving a look.",
      retryable: false,
    });
  }

  // Persistence must be live to store a look. Deliberately narrower than
  // try-on's `isAuraLiveConfigured()`: a save calls no model, so a missing
  // OpenAI image key must not block it — only Cloudinary and the database do.
  if (!(isCloudinaryConfigured() && isDatabaseConfigured())) {
    return failure(503, {
      code: "configuration-unavailable",
      error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
      retryable: false,
    });
  }

  const parsed = styleBookSaveSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { look, sources } = parsed.data;
  const folder = `${STYLE_BOOK_FOLDER}/${userId}`;

  // Upload every image first — exactly 1 look + N source images — then a single
  // insert. The portrait is NOT re-uploaded; its existing secure URL is copied
  // as the snapshot. Cloudinary assigns a random `public_id` per asset (not the
  // profile's deterministic scheme): a Saved Look is insert-only and
  // many-per-user, so a deterministic id would let a later save silently
  // overwrite an earlier look's image.
  let lookImageUrl: string;
  let sourceRecords: SavedLookSource[];
  try {
    const [uploadedLook, ...uploadedSources] = await Promise.all([
      uploadImage(look, folder),
      ...sources.map((source) => uploadImage(source.image, folder)),
    ]);
    lookImageUrl = uploadedLook.secure_url;
    sourceRecords = sources.map((source, index) => ({
      imageUrl: uploadedSources[index].secure_url,
      name: source.name,
      // Provenance is inferred and stored without a `kind`: keep `url`/`site`
      // only when both are present (a link), omit them entirely for an upload.
      ...(source.url && source.site
        ? { url: source.url, site: source.site }
        : {}),
    }));
  } catch (error) {
    console.error("Style Book image upload failed", error);
    return failure(500, {
      code: "save-failed",
      error: SAVE_FAILED,
      retryable: true,
    });
  }

  let saved: {
    id: string;
    caption: string;
    lookImageUrl: string;
    createdAt: Date;
  };
  try {
    // Insert-only, never upsert — this is what makes a Saved Look immutable and
    // the gallery grows-only. Scoped to the session user via `connect`, so a
    // caller can never write a look under someone else's ownership.
    saved = await prisma.savedLook.create({
      data: {
        user: { connect: { clerkId: userId } },
        lookImageUrl,
        caption: deriveLookCaption(sources.map((source) => source.name)),
        // Snapshot the portrait the look was generated against. A completed
        // try-on always had one; `?? ""` is a defensive floor for the column's
        // non-null contract, never a reachable save path.
        portraitUrl: profile.portraitUrl ?? "",
        sources: sourceRecords,
      },
      select: {
        id: true,
        caption: true,
        lookImageUrl: true,
        createdAt: true,
      },
    });
  } catch (error) {
    console.error("Style Book persistence failed", error);
    return failure(500, {
      code: "save-failed",
      error: SAVE_FAILED,
      retryable: true,
    });
  }

  return NextResponse.json(saved, { status: 201 });
}
