-- AlterTable: add time_zone to Group
ALTER TABLE "Group" ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'UTC';

-- Backfill existing groups to America/Los_Angeles (the effective legacy timezone).
-- This matches the SCHEDULE_TZ constant used by the scheduler before this column existed.
UPDATE "Group" SET "time_zone" = 'America/Los_Angeles';
