-- 營運門市：區分週一～五與週六營業時長
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "weekday_business_hours" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "saturday_business_hours" DECIMAL(10, 2);

UPDATE "stores"
SET "weekday_business_hours" = "daily_business_hours"
WHERE "weekday_business_hours" IS NULL
  AND "daily_business_hours" IS NOT NULL;
