import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isAuraLiveConfigured,
} from "@/lib/aura-config";
import { admitGoogleAuraIdentity } from "@/lib/aura-identity";
import { AuraTryOnError, generateAuraTryOn } from "@/lib/aura-try-on";
import { uploadImage } from "@/lib/cloudinary";
import { getPrisma } from "@/lib/prisma";
import { wardrobeGarmentDataUri } from "@/lib/wardrobe-try-on";

/**
 * On-demand try-on preview for a single planned outfit (spec §6, ticket #169).
 *
 * It REUSES the try-on *generator* and the Cloudinary upload *helper* — never the
 * `SavedLook` model or the review route — so a Planned Outfit and a Saved Look
 * stay separate: load the outfit's live item set server-side, generate the look
 * onto the saved portrait with {@link generateAuraTryOn}, upload it under a
 * deterministic per-outfit `public_id` (overwrite + invalidate, so Regenerate/Swap
 * never accumulate orphans), and write `PlannedOutfit.previewImageUrl` as the
 * SINGLE server-authoritative commit point. Any failure before that write leaves
 * `previewImageUrl` null — never a torn cache — and the whole thing is retryable.
 *
 * The ephemeral `POST /api/aura/try-on` route is deliberately left untouched.
 */

type RouteContext = { params: Promise<{ eventId: string }> };

type Failure = { code: string; error: string; retryable: boolean };

function failure(status: number, body: Failure) {
  return NextResponse.json(body, { status });
}

// Deterministic per-outfit asset location. Segmenting by the owning user keeps a
// tidy folder; the outfit id as `public_id` is what makes a regenerate overwrite
// in place instead of stacking orphans (the inverse of Saved Look's random id,
// which it needs because a look is insert-only and many-per-user).
const PREVIEW_FOLDER_ROOT = "fashion-app/calendar-preview";

export async function POST(_request: Request, { params }: RouteContext) {
  const { userId } = await auth();
  if (!userId) {
    return failure(401, { code: "unauthorized", error: "Unauthorized", retryable: false });
  }

  // The same owner-only AURA trust boundary as try-on and Style Book: a preview
  // composites onto the saved portrait, so the caller must be the verified
  // Google identity behind that portrait before any generation.
  const clerkUser = await currentUser();
  const admission = clerkUser && admitGoogleAuraIdentity(clerkUser);
  if (!admission?.ok) {
    return failure(403, {
      code: "identity-refused",
      error: admission?.error ?? "We couldn't verify your Google identity.",
      retryable: false,
    });
  }

  // The config gate ANDs Cloudinary + Database + image model — exactly the
  // generation ∪ persistence union the preview needs.
  if (!isAuraLiveConfigured()) {
    return failure(503, {
      code: "configuration-unavailable",
      error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
      retryable: false,
    });
  }

  const { eventId } = await params;
  const prisma = getPrisma();

  // Owner-scoped load of the planned outfit and its LIVE item set. The FK is a
  // live reference (ADR 0001): a soft-deleted item still carries a row (its
  // `deletedAt` is set), a hard-deleted one has cascaded away entirely.
  let outfit;
  try {
    outfit = await prisma.plannedOutfit.findFirst({
      where: { eventId, user: { clerkId: userId } },
      select: {
        id: true,
        userId: true,
        items: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            wardrobeItem: {
              select: {
                id: true,
                name: true,
                deletedAt: true,
                normalizedMediaId: true,
                normalizedMediaFormat: true,
              },
            },
          },
        },
        user: { select: { auraProfile: { select: { portraitUrl: true } } } },
      },
    });
  } catch (error) {
    console.error("Preview outfit lookup failed", error);
    return failure(500, {
      code: "preview-lookup-failed",
      error: "We couldn't open that outfit. Please try again.",
      retryable: true,
    });
  }

  if (!outfit) {
    return failure(404, {
      code: "outfit-not-found",
      error: "Plan this outfit before generating a preview.",
      retryable: false,
    });
  }

  const portraitUrl = outfit.user.auraProfile?.portraitUrl ?? null;
  if (!portraitUrl) {
    return failure(422, {
      code: "no-portrait",
      error: "Create your AURA portrait before generating a preview.",
      retryable: false,
    });
  }

  // A live-FK item that vanished between plan and preview — soft-deleted (row
  // still present, `deletedAt` set) or hard-deleted (row cascaded away, so the
  // set shrank, possibly to empty) — makes the persisted pick no longer
  // renderable. Refuse with the re-plan path rather than previewing a stale set.
  const items = outfit.items;
  const anyDeleted = items.some((item) => item.wardrobeItem.deletedAt !== null);
  if (items.length === 0 || anyDeleted) {
    return failure(422, {
      code: "wardrobe-source-invalid",
      error:
        "This outfit references a wardrobe item that's no longer available. Re-plan it and try again.",
      retryable: false,
    });
  }

  // Resolve each live item's authorized normalized rendition to the data URI the
  // generator consumes, in position order — the same provenance-free path the
  // ephemeral try-on route uses.
  let garments: string[];
  try {
    garments = await Promise.all(
      items.map((item) =>
        wardrobeGarmentDataUri(
          item.wardrobeItem.normalizedMediaId,
          item.wardrobeItem.normalizedMediaFormat,
        ),
      ),
    );
  } catch (error) {
    console.error("Preview wardrobe media resolution failed", error);
    return failure(503, {
      code: "wardrobe-source-unavailable",
      error: "We couldn't prepare one of your wardrobe items. Please try again.",
      retryable: true,
    });
  }

  // ---- Commit ordering: generate → upload → set previewImageUrl. ----

  let look: string;
  try {
    look = await generateAuraTryOn({ clerkId: userId, portraitUrl, garments });
  } catch (error) {
    console.error("Preview generation failed", error);
    // Reuse the try-on failure vocabulary → the same HTTP codes.
    if (error instanceof AuraTryOnError) {
      if (error.kind === "refused" || error.kind === "invalid-garment") {
        return failure(422, {
          code: "preview-refused",
          error:
            "That outfit couldn't be rendered onto your portrait. Try a different pick.",
          retryable: false,
        });
      }
      if (error.kind === "timeout") {
        return failure(504, {
          code: "preview-timeout",
          error: "The preview took too long to generate. Please try again.",
          retryable: true,
        });
      }
    }
    return failure(503, {
      code: "preview-temporarily-unavailable",
      error: "Preview generation is temporarily unavailable. Please try again.",
      retryable: true,
    });
  }

  // Upload under the deterministic per-outfit key, overwriting any prior preview
  // in place. A failure here (or in the write below) leaves `previewImageUrl`
  // null — the retry regenerates onto the same key, so no orphan accumulates.
  let previewImageUrl: string;
  try {
    const uploaded = await uploadImage(
      `data:image/jpeg;base64,${look}`,
      `${PREVIEW_FOLDER_ROOT}/${outfit.userId}`,
      { publicId: outfit.id, overwrite: true, invalidate: true },
    );
    previewImageUrl = uploaded.secure_url;
  } catch (error) {
    console.error("Preview upload failed", error);
    return failure(500, {
      code: "save-failed",
      error: "We generated your preview but couldn't save it. Please try again.",
      retryable: true,
    });
  }

  // The single commit point: the outfit-id → previewImageUrl binding is
  // server-authoritative and only becomes true once this write lands.
  try {
    await prisma.plannedOutfit.update({
      where: { id: outfit.id },
      data: { previewImageUrl },
    });
  } catch (error) {
    console.error("Preview persistence failed", error);
    return failure(500, {
      code: "save-failed",
      error: "We generated your preview but couldn't save it. Please try again.",
      retryable: true,
    });
  }

  return NextResponse.json({ previewImageUrl }, { status: 200 });
}
