CREATE TYPE "WardrobeItemCategory" AS ENUM ('tops', 'bottoms', 'bags', 'shoes', 'accessories');

CREATE TABLE "WardrobeItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "WardrobeItemCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "brand" TEXT,
    "originalMediaId" TEXT NOT NULL,
    "originalMediaFormat" TEXT NOT NULL,
    "normalizedMediaId" TEXT NOT NULL,
    "normalizedMediaFormat" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "recoveryExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WardrobeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WardrobeItem_userId_deletedAt_category_createdAt_idx"
ON "WardrobeItem"("userId", "deletedAt", "category", "createdAt");

ALTER TABLE "WardrobeItem"
ADD CONSTRAINT "WardrobeItem_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
