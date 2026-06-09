-- 新店保障設定
CREATE TABLE "NewStoreSetting" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "openDate" DATE NOT NULL,
    "guaranteeMonths" INTEGER NOT NULL DEFAULT 5,
    "dailyGuarantee" DECIMAL(10,2) NOT NULL DEFAULT 2640,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewStoreSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewStoreSetting_storeId_key" ON "NewStoreSetting"("storeId");

ALTER TABLE "NewStoreSetting" ADD CONSTRAINT "NewStoreSetting_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 獎金倍率
CREATE TABLE "BonusMultiplier" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BonusMultiplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BonusMultiplier_position_key" ON "BonusMultiplier"("position");

-- 月績效獎金結果
CREATE TABLE "MonthlyBonusResult" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "position" TEXT,
    "totalCalcHours" DECIMAL(10,2) NOT NULL,
    "targetBonus" DECIMAL(10,2) NOT NULL,
    "operationsBonus" DECIMAL(10,2) NOT NULL,
    "subtotalBonus" DECIMAL(10,2) NOT NULL,
    "newHireRatio" DECIMAL(5,2) NOT NULL,
    "isNewStoreGuarantee" BOOLEAN NOT NULL DEFAULT false,
    "guaranteeAmount" DECIMAL(10,2),
    "bonusMultiplier" DECIMAL(5,2) NOT NULL,
    "accountabilityRatio" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "finalBonus" DECIMAL(10,2) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MonthlyBonusResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyBonusResult_yearMonth_employeeId_key" ON "MonthlyBonusResult"("yearMonth", "employeeId");
CREATE INDEX "MonthlyBonusResult_yearMonth_idx" ON "MonthlyBonusResult"("yearMonth");

ALTER TABLE "MonthlyBonusResult" ADD CONSTRAINT "MonthlyBonusResult_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 每日獎金明細
CREATE TABLE "MonthlyBonusDailyDetail" (
    "id" TEXT NOT NULL,
    "bonusResultId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "weekday" INTEGER NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "isTargetMet" BOOLEAN NOT NULL,
    "isExceeded" BOOLEAN NOT NULL,
    "efficiencyRatio" DECIMAL(12,2) NOT NULL,
    "scheduledHours" DECIMAL(10,2) NOT NULL,
    "actualWorkHours" DECIMAL(10,2) NOT NULL,
    "calcHours" DECIMAL(10,2) NOT NULL,
    "baseBonus" DECIMAL(10,2) NOT NULL,
    "dailyBonus" DECIMAL(10,2) NOT NULL,
    "dispatchNote" TEXT,
    CONSTRAINT "MonthlyBonusDailyDetail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonthlyBonusDailyDetail_bonusResultId_idx" ON "MonthlyBonusDailyDetail"("bonusResultId");
CREATE INDEX "MonthlyBonusDailyDetail_workDate_idx" ON "MonthlyBonusDailyDetail"("workDate");

ALTER TABLE "MonthlyBonusDailyDetail" ADD CONSTRAINT "MonthlyBonusDailyDetail_bonusResultId_fkey"
    FOREIGN KEY ("bonusResultId") REFERENCES "MonthlyBonusResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
