-- Business rule: a store can "day-close" multiple times in the same calendar day.
-- Therefore, (revenueDate, storeId) must NOT be unique.

-- Drop unique constraint/index if present (name from Prisma default).
ALTER TABLE "RevenueRecord"
  DROP CONSTRAINT IF EXISTS "RevenueRecord_revenueDate_storeId_key";

DROP INDEX IF EXISTS "RevenueRecord_revenueDate_storeId_key";

-- Keep query performance for filtering by day+store.
CREATE INDEX IF NOT EXISTS "RevenueRecord_revenueDate_storeId_idx"
  ON "RevenueRecord" ("revenueDate", "storeId");

