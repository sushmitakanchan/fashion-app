-- Preserve the first completed AURA verdict for each saved look so reopening
-- the look never silently changes its score or advice.
ALTER TABLE "SavedLook" ADD COLUMN IF NOT EXISTS "auraReview" JSONB;
