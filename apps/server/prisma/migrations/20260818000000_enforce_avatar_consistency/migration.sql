-- Reconcile any rows where avatar and avatar_updated_at disagree. Expected to affect
-- zero rows; included because production has historically had columns applied outside
-- Prisma migrations.
UPDATE "User" SET "avatar_updated_at" = NOW()
  WHERE "avatar" IS NOT NULL AND "avatar_updated_at" IS NULL;

UPDATE "User" SET "avatar_updated_at" = NULL
  WHERE "avatar" IS NULL AND "avatar_updated_at" IS NOT NULL;

-- The API derives has_avatar from avatar_updated_at and 404s the avatar route on a null
-- timestamp. Make that invariant enforceable rather than conventional.
ALTER TABLE "User" ADD CONSTRAINT "user_avatar_consistency"
  CHECK (("avatar" IS NULL) = ("avatar_updated_at" IS NULL));
