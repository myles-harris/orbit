-- One-time fix for calls stuck in 'activating' that pre-date the claimed_at column.
-- These rows have claimed_at IS NULL and will never be reclaimed by the normal sweep,
-- which requires claimed_at < cutoff. Reset them to 'scheduled' so they are picked up
-- on the next activation sweep.
UPDATE "CallSession"
SET status = 'scheduled'
WHERE status = 'activating'
  AND claimed_at IS NULL
  AND ends_at > NOW();
