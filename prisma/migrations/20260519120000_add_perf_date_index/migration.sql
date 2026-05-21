CREATE INDEX IF NOT EXISTS "RevenueRecord_storeId_revenueDate_idx" ON "RevenueRecord"("storeId", "revenueDate");
CREATE INDEX IF NOT EXISTS "PerformanceDaily_storeId_workDate_idx" ON "PerformanceDaily"("storeId", "workDate");
