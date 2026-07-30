import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isAuraLiveConfigured,
} from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { AuraTryOnError, generateAuraTryOn } from "@/lib/aura-try-on";
import { getPrisma } from "@/lib/prisma";
import { wardrobeGarmentDataUri } from "@/lib/wardrobe-try-on";
import { auraTryOnSchema, isTryOnWardrobeSource } from "@/lib/validations";

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

  // Wardrobe sources reference an item by id instead of carrying its bytes. Admit
  // only the caller's own active items: the ownership + active-lifecycle filter is
  // the whole admission story, so a forged, foreign, or deleted id resolves to no
  // row and is refused before any generation.
  const sources = parsed.data.garments;
  const wardrobeIds = sources
    .filter(isTryOnWardrobeSource)
    .map((source) => source.wardrobeItemId);

  const wardrobeById = new Map<
    string,
    { name: string; normalizedMediaId: string; normalizedMediaFormat: string }
  >();
  if (wardrobeIds.length > 0) {
    try {
      const rows = await prisma.wardrobeItem.findMany({
        where: {
          id: { in: wardrobeIds },
          user: { clerkId: userId },
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          normalizedMediaId: true,
          normalizedMediaFormat: true,
        },
      });
      for (const row of rows) wardrobeById.set(row.id, row);
    } catch (error) {
      console.error("Wardrobe source lookup failed", error);
      return failure(500, {
        code: "wardrobe-lookup-failed",
        error: "We couldn't check your wardrobe items. Please try again.",
        retryable: true,
      });
    }

    // Any requested id that isn't an active, owned item — unknown, deleted, or
    // another participant's — leaves the batch unresolvable.
    if (wardrobeIds.some((id) => !wardrobeById.has(id))) {
      return failure(422, {
        code: "wardrobe-source-invalid",
        error:
          "One of your selected wardrobe items is no longer available. Refresh your wardrobe and try again.",
        retryable: false,
      });
    }
  }

  // Resolve every source, in order, to the provenance-free { image, name } the
  // generator and response share. Wardrobe items resolve their authorized
  // normalized rendition to a data URI and carry their saved name.
  let garments: string[];
  let garmentNames: string[];
  try {
    const resolved = await Promise.all(
      sources.map(async (source) => {
        if (isTryOnWardrobeSource(source)) {
          const item = wardrobeById.get(source.wardrobeItemId)!;
          const image = await wardrobeGarmentDataUri(
            item.normalizedMediaId,
            item.normalizedMediaFormat,
          );
          return { image, name: item.name };
        }
        return { image: source.image, name: source.name };
      }),
    );
    garments = resolved.map((source) => source.image);
    garmentNames = resolved.map((source) => source.name);
  } catch (error) {
    console.error("Wardrobe source media resolution failed", error);
    return failure(503, {
      code: "wardrobe-source-unavailable",
      error:
        "We couldn't prepare one of your wardrobe items. Please try again.",
      retryable: true,
    });
  }

  let look: string;
  try {
    look = await generateAuraTryOn({
      clerkId: userId,
      portraitUrl: profile.portraitUrl,
      garments,
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
      garments: garmentNames,
    },
    { status: 200 },
  );
}
