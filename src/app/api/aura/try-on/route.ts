import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isAuraLiveConfigured,
} from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { AuraTryOnError, generateAuraTryOn } from "@/lib/aura-try-on";
import { getPrisma } from "@/lib/prisma";
import { auraTryOnSchema } from "@/lib/validations";

type Failure = {
  code: string;
  error: string;
  retryable: boolean;
};

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
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
      error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
      retryable: false,
    });
  }

  const parsed = auraTryOnSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let prisma: ReturnType<typeof getPrisma>;
  let profile: { id: string; portraitUrl: string | null } | null;
  try {
    prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: {
        auraProfile: { select: { id: true, portraitUrl: true } },
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
      error: "Save your AURA profile before trying on a look.",
      retryable: false,
    });
  }

  // The subject of every try-on is the saved portrait. Without one there is
  // nothing to composite onto; the client resolves this by redirecting to
  // `/aura` to create the portrait, so surface it as its own non-retryable code
  // rather than a generic failure.
  if (!profile.portraitUrl) {
    return failure(422, {
      code: "no-portrait",
      error: "Create your AURA portrait before trying on a look.",
      retryable: false,
    });
  }

  let look: string;
  try {
    look = await generateAuraTryOn({
      clerkId: userId,
      portraitUrl: profile.portraitUrl,
      garments: parsed.data.garments.map((garment) => garment.image),
    });
  } catch (error) {
    console.error("AURA try-on generation failed", error);
    if (error instanceof AuraTryOnError) {
      if (error.kind === "refused") {
        return failure(422, {
          code: "try-on-refused",
          error:
            "That garment (or the generated look) was blocked. Attach a different garment and try again.",
          retryable: false,
        });
      }
      if (error.kind === "invalid-garment") {
        return failure(422, {
          code: "invalid-garment",
          error:
            "We couldn't use one of those garment images. Attach a different image and try again.",
          retryable: false,
        });
      }
      if (error.kind === "timeout") {
        return failure(504, {
          code: "try-on-timeout",
          error: "The look took too long to generate. Please try again.",
          retryable: true,
        });
      }
    }
    return failure(503, {
      code: "try-on-temporarily-unavailable",
      error: "Look generation is temporarily unavailable. Please try again.",
      retryable: true,
    });
  }

  // Ephemeral: the look is returned inline as a data URL. Nothing is uploaded to
  // Cloudinary and nothing is written to the database on any path.
  return NextResponse.json(
    {
      image: `data:image/jpeg;base64,${look}`,
      garments: parsed.data.garments.map((garment) => garment.name),
    },
    { status: 200 },
  );
}
