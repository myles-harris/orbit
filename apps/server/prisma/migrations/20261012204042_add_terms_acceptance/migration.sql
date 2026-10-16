-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accepted_terms_at" TIMESTAMPTZ(6),
ADD COLUMN     "accepted_terms_version" INTEGER;

-- The version and the time are written together at every call site.
ALTER TABLE "User" ADD CONSTRAINT "user_terms_consistency"
  CHECK (("accepted_terms_version" IS NULL) = ("accepted_terms_at" IS NULL));
