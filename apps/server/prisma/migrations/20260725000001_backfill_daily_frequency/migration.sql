-- WS-6: daily groups must have daily_frequency = 1 exactly.
-- Backfill any rows that were set to a different value by old clients or
-- the previous default of 5.
UPDATE "Group"
   SET "daily_frequency" = 1
 WHERE "cadence" = 'daily'
   AND "daily_frequency" IS DISTINCT FROM 1;
