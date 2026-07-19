import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { isAuraLiveConfigured } from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import {
  AuraPortraitError,
  generateAuraPortrait,
} from "@/lib/aura-portrait";
import { cloudinary } from "@/lib/cloudinary";
import { getPrisma } from "@/lib/prisma";

type Failure = {
  code: string;
  error: string;
  retryable: boolean;
};

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, {
      code: "unauthorized",
      error: "Unauthorized",
      retryable: false,
    });
  }

  const clerkUser = await currentUser();
  const admission = clerkUser && admitGoogleAuraIdentity(clerkUser);
  if (!admission?.ok) {
    return failure(403, {
      code: "identity-refused",
      error: admission?.error ?? "We couldn't verify your Google identity.",
      retryable: false,
    });
  }

  if (!isAuraLiveConfigured()) {
    return failure(503, {
      code: "configuration-unavailable",
      error: "AURA portrait generation is unavailable in this environment.",
      retryable: false,
    });
  }

  let prisma: ReturnType<typeof getPrisma>;
  let profile: {
    id: string;
    photoFrontUrl: string | null;
    photoCloseupUrl: string | null;
  } | null;
  try {
    prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        auraProfile: {
          select: { id: true, photoFrontUrl: true, photoCloseupUrl: true },
        },
      },
    });
    profile = user?.auraProfile ?? null;
  } catch (error) {
    console.error("AURA profile lookup failed", error);
    return failure(500, {
      code: "profile-lookup-failed",
      error: "We couldn't load your saved AURA profile. Please try again.",
      retryable: true,
    });
  }

  if (!profile) {
    return failure(404, {
      code: "profile-not-found",
      error: "Save your AURA profile before generating a portrait.",
      retryable: false,
    });
  }

  if (!profile.photoFrontUrl || !profile.photoCloseupUrl) {
    return failure(422, {
      code: "reference-images-missing",
      error: "Your saved AURA profile needs both portrait reference photos.",
      retryable: false,
    });
  }

  let portraitBase64: string;
  try {
    portraitBase64 = await generateAuraPortrait({
      clerkId: userId,
      photoFrontUrl: profile.photoFrontUrl,
      photoCloseupUrl: profile.photoCloseupUrl,
    });
  } catch (error) {
    console.error("AURA portrait generation failed", error);
    if (error instanceof AuraPortraitError) {
      if (error.kind === "refused") {
        return failure(422, {
          code: "portrait-refused",
          error:
            "OpenAI couldn't create an AURA portrait from these reference photos. Use different photos and try again.",
          retryable: false,
        });
      }
      if (error.kind === "timeout") {
        return failure(504, {
          code: "portrait-timeout",
          error: "Portrait generation took too long. Please try again.",
          retryable: true,
        });
      }
    }
    return failure(503, {
      code: "portrait-temporarily-unavailable",
      error: "Portrait generation is temporarily unavailable. Please try again.",
      retryable: true,
    });
  }

  let portraitUrl: string;
  try {
    // A new asset id keeps the previous portrait addressable until the database
    // update below succeeds. Failed attempts therefore cannot replace it.
    const uploaded = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${portraitBase64}`,
      {
        public_id: `fashion-app/aura/${userId}/portrait-${crypto.randomUUID()}`,
        resource_type: "image",
      },
    );
    portraitUrl = uploaded.secure_url;
  } catch (error) {
    console.error("AURA portrait storage failed", error);
    return failure(502, {
      code: "portrait-storage-failed",
      error: "We couldn't store your portrait. Please try again.",
      retryable: true,
    });
  }

  try {
    await prisma.auraProfile.update({
      where: { id: profile.id },
      data: { portraitUrl },
    });
  } catch (error) {
    console.error("AURA portrait persistence failed", error);
    return failure(500, {
      code: "portrait-save-failed",
      error: "We couldn't save your portrait. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ portraitUrl }, { status: 201 });
}
