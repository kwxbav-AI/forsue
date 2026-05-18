-- 營運門市：每日營業時長、每日預設工時（Dashboard 加班計算用）
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "daily_business_hours" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "default_labor_hours_per_day" DECIMAL(10, 2);
