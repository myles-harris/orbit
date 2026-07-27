-- AlterTable: add avatar_updated_at to User
ALTER TABLE "User" ADD COLUMN "avatar_updated_at" TIMESTAMPTZ(6);

-- Backfill: mark existing avatars as updated now so ETag headers are non-null from the start.
UPDATE "User" SET "avatar_updated_at" = NOW() WHERE "avatar" IS NOT NULL;
