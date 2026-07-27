ALTER TABLE "User"
  ADD COLUMN "notify_sound"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_vibrate"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_break_focus" BOOLEAN NOT NULL DEFAULT false;
