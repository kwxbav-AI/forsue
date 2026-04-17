-- Allow multiple settlements per store per day, but dedupe by checkout number when provided.

ALTER TABLE "RevenueRecord"
  ADD COLUMN IF NOT EXISTS "checkoutNo" TEXT;

-- Unique key for idempotent uploads (same checkout slip uploaded multiple times).
-- Note: checkoutNo can be NULL; PostgreSQL allows multiple NULLs in a UNIQUE index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'RevenueRecord_storeId_revenueDate_checkoutNo_key'
  ) THEN
    CREATE UNIQUE INDEX "RevenueRecord_storeId_revenueDate_checkoutNo_key"
      ON "RevenueRecord" ("storeId", "revenueDate", "checkoutNo");
  END IF;
END $$;

