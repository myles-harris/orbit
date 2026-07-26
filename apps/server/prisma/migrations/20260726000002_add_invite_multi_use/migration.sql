-- AlterTable: add multi-use invite fields
ALTER TABLE "Invite"
  ADD COLUMN "max_uses"   INTEGER,
  ADD COLUMN "use_count"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6);
