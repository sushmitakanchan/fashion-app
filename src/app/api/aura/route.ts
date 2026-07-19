import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAuraLiveConfigured } from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { cloudinary } from "@/lib/cloudinary";
import { getPrisma } from "@/lib/prisma";
import {
  auraSubmissionSchema,
  PHOTO_ANGLES,
  type PhotoAngle,
} from "@/lib/validations";

// Persistence is the one failure the user can do nothing about except retry,
// and retrying is always safe here — the profile is upserted and supplied
// assets have deterministic ids — so say so rather than leaking a driver error.
// Sent as a 500, deliberately not the 503 the unconfigured-environment backstop
// below returns: one is a broken request, the other is a permanent property of
// this deployment, and a client shouldn't have to guess which it hit.
const SAVE_FAILED =
  "We couldn't save your AURA. Your photos are safe — please try again.";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AURA's identity boundary is stricter than a valid Clerk session: the pilot
  // accepts only a linked, verified Google account. Keep this ahead of request
  // validation, user mirroring, uploads, and profile persistence so an
  // unsupported identity cannot leave partial AURA data behind.
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json(
      { error: "We couldn't verify your Google identity." },
      { status: 403 },
    );
  }
  const admission = admitGoogleAuraIdentity(clerkUser);
  if (!admission.ok) {
    return NextResponse.json({ error: admission.error }, { status: 403 });
  }

  // Live submission uploads photos and persists a profile; without Cloudinary
  // and the database configured this environment can only run the local
  // preview, so refuse rather than fail deep inside an upload the client
  // believes succeeded. The UI never posts here in preview mode — this is the
  // server-side backstop.
  if (!isAuraLiveConfigured()) {
    return NextResponse.json(
      {
        error:
          "Live AURA submission isn't configured here. This environment runs in local-preview mode only.",
      },
      { status: 503 },
    );
  }

  const parsed = auraSubmissionSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { photos } = parsed.data;

  // `AuraProfile` hangs off the internal `User` row, and nothing else in the app
  // creates one yet — so mirror the admitted Clerk user across on the way through.
  let prisma: ReturnType<typeof getPrisma>;
  let user: { id: string };
  try {
    prisma = getPrisma();
    user = await prisma.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        email: admission.email,
        name: admission.googleName || null,
        imageUrl: clerkUser.imageUrl,
      },
      // AURA display-name edits live on AuraProfile. Never write any display
      // name back into Clerk's mirrored account data on a later AURA save.
      update: { email: admission.email, imageUrl: clerkUser.imageUrl },
    });
  } catch (error) {
    // Before any upload, so there's nothing to unwind — but the caller still
    // needs to be told this failed rather than shown a half-finished AURA.
    console.error("AURA user mirroring failed", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }

  let urls: Partial<Record<PhotoAngle, string>>;
  try {
    // Deterministic public_ids (rather than `uploadImage`'s random ones) make
    // every profile retry replace the same assets instead of orphaning files.
    // The portrait references are required by the schema; future-avatar angles
    // are uploaded only when the user supplied them.
    const suppliedPhotos = PHOTO_ANGLES.flatMap((angle) => {
      const photo = photos[angle];
      return photo ? [{ angle, photo }] : [];
    });
    const uploads = await Promise.all(
      suppliedPhotos.map(({ angle, photo }) =>
        cloudinary.uploader.upload(photo, {
          public_id: `fashion-app/aura/${userId}/${angle}`,
          overwrite: true,
          resource_type: "image",
        }),
      ),
    );
    urls = Object.fromEntries(
      suppliedPhotos.map(({ angle }, i) => [angle, uploads[i].secure_url]),
    ) as Partial<Record<PhotoAngle, string>>;
  } catch (error) {
    // Any assets that did land keep their deterministic public_id, so a retry
    // overwrites them rather than accumulating orphans.
    console.error("AURA photo upload failed", error);
    return NextResponse.json(
      { error: "We couldn't upload your photos. Please try again." },
      { status: 502 },
    );
  }

  const profile = {
    name: parsed.data.name,
    age: parsed.data.age,
    gender: parsed.data.gender,
    heightCm: parsed.data.heightCm,
    weightKg: parsed.data.weightKg,
    bodyType: parsed.data.bodyType,
    photoFrontUrl: urls.front!,
    photoCloseupUrl: urls.closeup!,
    // The schema already refused anything but `true`; record when they agreed.
    consentedAt: new Date(),
  };

  // An omitted optional photo means the user chose not to replace it. The form
  // has no separate delete action, so retain an existing future-avatar reference
  // rather than turning a valid two-photo profile update into data loss.
  const suppliedAvatarPhotos = {
    ...(urls.left ? { photoLeftUrl: urls.left } : {}),
    ...(urls.right ? { photoRightUrl: urls.right } : {}),
    ...(urls.back ? { photoBackUrl: urls.back } : {}),
  };

  let aura: { id: string };
  try {
    // Keyed on the one-per-user relation, so regenerating replaces the profile
    // instead of duplicating it — and a retry after this fails is safe for the
    // same reason.
    aura = await prisma.auraProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...profile,
        photoLeftUrl: urls.left ?? null,
        photoRightUrl: urls.right ?? null,
        photoBackUrl: urls.back ?? null,
      },
      update: { ...profile, ...suppliedAvatarPhotos },
    });
  } catch (error) {
    console.error("AURA profile persistence failed", error);
    return NextResponse.json({ error: SAVE_FAILED }, { status: 500 });
  }

  return NextResponse.json({ id: aura.id }, { status: 201 });
}
