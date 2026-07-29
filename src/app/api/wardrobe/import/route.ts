import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import {
  AURA_CONFIGURATION_UNAVAILABLE_MESSAGE,
  isCloudinaryConfigured,
  isDatabaseConfigured,
} from "@/lib/aura-config";
import { getPrisma } from "@/lib/prisma";
import {
  exceedsActiveItemLimit,
  wardrobeCapacityErrorBody,
} from "@/lib/wardrobe";
import { uploadWardrobeMedia } from "@/lib/wardrobe-media";
import type { WardrobeItemMedia } from "@/lib/wardrobe-import-review";
import {
  photoDataUri,
  WARDROBE_MAX_ACTIVE_ITEMS,
  wardrobeImportSchema,
  type WardrobeImportImageInput,
} from "@/lib/validations";

// One imported image either becomes two private renditions or reports why it
// couldn't — the shape the browser feeds straight into the review state. A
// failed import never persists anything and never bars the rest of the batch.
type ImportItemResult =
  | {
      clientId: string;
      status: "ready";
      media: WardrobeItemMedia;
    }
  | {
      clientId: string;
      status: "failed";
      reason: string;
    };

const UPLOAD_FAILED_REASON = "We couldn't process that image. Try another.";

async function importOne(
  image: WardrobeImportImageInput,
  ownerKey: string,
): Promise<ImportItemResult> {
  // Validate each image on its own so one unsupported or malformed file is a
  // per-item failure rather than a 400 that discards the whole batch.
  const valid = photoDataUri.safeParse(image.dataUri);
  if (!valid.success) {
    return {
      clientId: image.clientId,
      status: "failed",
      reason: valid.error.issues[0]?.message ?? "That image can't be imported.",
    };
  }

  try {
    const { original, normalized } = await uploadWardrobeMedia(valid.data, ownerKey);
    return {
      clientId: image.clientId,
      status: "ready",
      media: {
        originalMediaId: original.mediaId,
        originalMediaFormat: original.format,
        normalizedMediaId: normalized.mediaId,
        normalizedMediaFormat: normalized.format,
      },
    };
  } catch (error) {
    console.error("Wardrobe import upload failed", error);
    return { clientId: image.clientId, status: "failed", reason: UPLOAD_FAILED_REASON };
  }
}

/**
 * Ingest a batch of up to 20 clothing images into the caller's private wardrobe,
 * producing (but not yet persisting) two private renditions per supported image.
 * The batch is rejected up front when it would push the account past its active-
 * item ceiling; each image then succeeds or fails independently, and the owner
 * confirms the survivors in review before a separate save persists them.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Import both stores media (Cloudinary) and counts active items (database), so
  // both must be live.
  if (!(isCloudinaryConfigured() && isDatabaseConfigured())) {
    return NextResponse.json(
      { error: AURA_CONFIGURATION_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const parsed = wardrobeImportSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { images } = parsed.data;

  let activeCount: number;
  try {
    activeCount = await getPrisma().wardrobeItem.count({
      where: { user: { clerkId: userId }, deletedAt: null },
    });
  } catch (error) {
    console.error("Wardrobe active-item count failed", error);
    return NextResponse.json(
      { error: "We couldn't open your wardrobe. Please try again." },
      { status: 500 },
    );
  }

  // Reject a batch that couldn't fit even if every image succeeded, before any
  // upload runs. The save boundary re-checks, since state can change in between.
  if (exceedsActiveItemLimit(activeCount, images.length)) {
    return NextResponse.json(wardrobeCapacityErrorBody(activeCount), { status: 409 });
  }

  // Each image is handled independently and never rejects the batch.
  const items = await Promise.all(
    images.map((image) => importOne(image, userId)),
  );

  return NextResponse.json({ items, activeCount, limit: WARDROBE_MAX_ACTIVE_ITEMS });
}
