ALTER TABLE "PushDevice"
  ADD COLUMN "live_activity_pts_token" TEXT,
  ADD COLUMN "pts_updated_at"          TIMESTAMPTZ(6);

CREATE INDEX "PushDevice_live_activity_pts_token_idx"
  ON "PushDevice" ("live_activity_pts_token")
  WHERE "live_activity_pts_token" IS NOT NULL;

ALTER TABLE "CallSession"
  ADD COLUMN "live_activity_tokens" JSONB;
