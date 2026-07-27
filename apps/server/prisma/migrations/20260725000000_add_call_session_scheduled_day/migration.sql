-- AlterTable: add scheduled_day to CallSession
ALTER TABLE "CallSession" ADD COLUMN "scheduled_day" TEXT;

-- CreateIndex: standard index for queries
CREATE INDEX "CallSession_scheduled_day_idx" ON "CallSession"("scheduled_day");

-- Backfill scheduled_day for all existing scheduled calls (Pacific Time)
-- Run E3 zombie cleanup and duplicate dedupe manually before this in production.
UPDATE "CallSession"
   SET "scheduled_day" = to_char("scheduled_at" AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD')
 WHERE "call_type" = 'scheduled' AND "scheduled_at" IS NOT NULL;

-- Partial unique index: at most one active/scheduled/activating call per group per day.
-- Prisma cannot express partial unique indexes; managed here as raw SQL.
-- Ended/cancelled rows are excluded so regeneration is never blocked.
CREATE UNIQUE INDEX "call_session_group_scheduled_day_active"
  ON "CallSession" ("group_id", "scheduled_day")
  WHERE "scheduled_day" IS NOT NULL
    AND "status" IN ('scheduled', 'activating', 'active');
