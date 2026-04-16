-- Convert "calendar day" columns to DATE to avoid timezone drift.
-- We keep the existing calendar day by casting timestamp -> date via ::date.

-- Attendance / dispatch / adjustments
ALTER TABLE "AttendanceRecord"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

ALTER TABLE "DispatchRecord"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

ALTER TABLE "WorkhourAdjustment"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

ALTER TABLE "StoreHourDeduction"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

-- Revenue
ALTER TABLE "RevenueRecord"
  ALTER COLUMN "revenueDate" TYPE DATE USING ("revenueDate"::date);

-- Performance
ALTER TABLE "PerformanceDaily"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

ALTER TABLE "PerformanceTargetSetting"
  ALTER COLUMN "effectiveStartDate" TYPE DATE USING ("effectiveStartDate"::date),
  ALTER COLUMN "effectiveEndDate" TYPE DATE USING ("effectiveEndDate"::date);

-- Misc
ALTER TABLE "Holiday"
  ALTER COLUMN "date" TYPE DATE USING ("date"::date);

ALTER TABLE "ContentEntry"
  ALTER COLUMN "workDate" TYPE DATE USING ("workDate"::date);

