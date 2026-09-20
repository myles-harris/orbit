-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "photo" BYTEA,
ADD COLUMN     "photo_mime_type" TEXT,
ADD COLUMN     "photo_updated_at" TIMESTAMPTZ(6);

-- The API derives has_photo from photo_updated_at and 404s the photo route on a null
-- timestamp, so the bytes and their version stamp must be written together. Mirrors
-- user_avatar_consistency. No reconciliation UPDATEs first: unlike User, these columns
-- have never existed outside Prisma, so every row is already consistent.
ALTER TABLE "Group" ADD CONSTRAINT "group_photo_consistency"
  CHECK (("photo" IS NULL) = ("photo_updated_at" IS NULL));
