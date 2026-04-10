-- Add AttendanceLocationMatchStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceLocationMatchStatus') THEN
    CREATE TYPE "AttendanceLocationMatchStatus" AS ENUM (
      'MATCH',
      'MISMATCH_CLOCKIN',
      'MISMATCH_CLOCKOUT',
      'MISMATCH_BOTH',
      'DISPATCH_EXPLAINED',
      'NEED_REVIEW',
      'EXCLUDED',
      'UNKNOWN'
    );
  END IF;
END $$;

-- Extend AttendanceRecord with raw info, parsed store, and match status
ALTER TABLE "AttendanceRecord"
  ADD COLUMN IF NOT EXISTS "clockInInfoRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "clockOutInfoRaw" TEXT,
  ADD COLUMN IF NOT EXISTS "clockInStoreText" TEXT,
  ADD COLUMN IF NOT EXISTS "clockOutStoreText" TEXT,
  ADD COLUMN IF NOT EXISTS "clockInStoreId" TEXT,
  ADD COLUMN IF NOT EXISTS "clockOutStoreId" TEXT,
  ADD COLUMN IF NOT EXISTS "locationMatchStatus" "AttendanceLocationMatchStatus" NOT NULL DEFAULT 'UNKNOWN';

-- AppSetting: key/value settings storage (JSON)
CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "valueJson" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");

