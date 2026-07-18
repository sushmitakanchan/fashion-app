import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAuraLiveConfigured } from "@/lib/aura-config";
import { cloudinary } from "@/lib/cloudinary";
import { getPrisma } from "@/lib/prisma";
import {
  auraSubmissionSchema,
  PHOTO_ANGLES,
  type PhotoAngle,
} from "@/lib/validations";

export async function POST(req: Request) {
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

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  // creates one yet — so mirror the Clerk user across on the way through.
  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress;
  if (!clerkUser || !email) {
    return NextResponse.json(
      { error: "Your account is missing an email address." },
      { status: 422 },
    );
  }

  const prisma = getPrisma();
  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    create: {
      clerkId: userId,
      email,
      name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "),
      imageUrl: clerkUser.imageUrl,
    },
    update: { email, imageUrl: clerkUser.imageUrl },
  });

  let urls: Record<PhotoAngle, string>;
  try {
    // Deterministic public_ids (rather than `uploadImage`'s random ones) so
    // regenerating an AURA overwrites the previous five assets instead of
    // orphaning them. `secure_url` is version-stamped, so it still cache-busts.
    const uploads = await Promise.all(
      PHOTO_ANGLES.map((angle) =>
        cloudinary.uploader.upload(photos[angle], {
          public_id: `fashion-app/aura/${userId}/${angle}`,
          overwrite: true,
          resource_type: "image",
        }),
      ),
    );
    urls = Object.fromEntries(
      PHOTO_ANGLES.map((angle, i) => [angle, uploads[i].secure_url]),
    ) as Record<PhotoAngle, string>;
  } catch (error) {
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
    photoFrontUrl: urls.front,
    photoLeftUrl: urls.left,
    photoRightUrl: urls.right,
    photoCloseupUrl: urls.closeup,
    photoBackUrl: urls.back,
    // The schema already refused anything but `true`; record when they agreed.
    consentedAt: new Date(),
  };

  const aura = await prisma.auraProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...profile },
    update: profile,
  });

  return NextResponse.json({ id: aura.id }, { status: 201 });
}
