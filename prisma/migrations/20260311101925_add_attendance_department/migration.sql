-- CreateEnum
CREATE TYPE "UploadFileType" AS ENUM ('ATTENDANCE', 'DISPATCH', 'INVENTORY_REFERENCE', 'EMPLOYEE_MASTER', 'DAILY_REVENUE');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('INVENTORY_ARTICLE', 'EXPIRY', 'CLEANING', 'OTHER');

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAlias" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultStoreId" TEXT,
    "position" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "fileType" "UploadFileType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "versionLabel" TEXT,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "originalStoreId" TEXT,
    "department" TEXT,
    "workHours" DECIMAL(10,2) NOT NULL,
    "shiftType" TEXT,
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchRecord" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromStoreId" TEXT,
    "toStoreId" TEXT NOT NULL,
    "dispatchHours" DECIMAL(10,2) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "remark" TEXT,
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueRecord" (
    "id" TEXT NOT NULL,
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "revenueAmount" DECIMAL(12,2) NOT NULL,
    "cashIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "linePayAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expenseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkhourAdjustment" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT,
    "adjustmentType" "AdjustmentType" NOT NULL,
    "adjustmentHours" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkhourAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceTargetSetting" (
    "id" TEXT NOT NULL,
    "targetValue" DECIMAL(10,2) NOT NULL,
    "effectiveStartDate" TIMESTAMP(3) NOT NULL,
    "effectiveEndDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerformanceTargetSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceDaily" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "revenueAmount" DECIMAL(12,2) NOT NULL,
    "totalWorkHours" DECIMAL(10,2) NOT NULL,
    "efficiencyRatio" DECIMAL(12,2) NOT NULL,
    "targetValue" DECIMAL(10,2) NOT NULL,
    "isTargetMet" BOOLEAN NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versionNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PerformanceDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "operator" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Store_name_key" ON "Store"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreAlias_code_key" ON "StoreAlias"("code");

-- CreateIndex
CREATE INDEX "StoreAlias_storeId_idx" ON "StoreAlias"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workDate_idx" ON "AttendanceRecord"("workDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_employeeId_workDate_idx" ON "AttendanceRecord"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "DispatchRecord_workDate_idx" ON "DispatchRecord"("workDate");

-- CreateIndex
CREATE INDEX "DispatchRecord_employeeId_workDate_idx" ON "DispatchRecord"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "RevenueRecord_revenueDate_idx" ON "RevenueRecord"("revenueDate");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueRecord_revenueDate_storeId_key" ON "RevenueRecord"("revenueDate", "storeId");

-- CreateIndex
CREATE INDEX "WorkhourAdjustment_workDate_idx" ON "WorkhourAdjustment"("workDate");

-- CreateIndex
CREATE INDEX "WorkhourAdjustment_employeeId_workDate_idx" ON "WorkhourAdjustment"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "PerformanceTargetSetting_effectiveStartDate_effectiveEndDat_idx" ON "PerformanceTargetSetting"("effectiveStartDate", "effectiveEndDate");

-- CreateIndex
CREATE INDEX "PerformanceDaily_workDate_idx" ON "PerformanceDaily"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceDaily_workDate_storeId_versionNo_key" ON "PerformanceDaily"("workDate", "storeId", "versionNo");

-- AddForeignKey
ALTER TABLE "StoreAlias" ADD CONSTRAINT "StoreAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_defaultStoreId_fkey" FOREIGN KEY ("defaultStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRecord" ADD CONSTRAINT "DispatchRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueRecord" ADD CONSTRAINT "RevenueRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkhourAdjustment" ADD CONSTRAINT "WorkhourAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceDaily" ADD CONSTRAINT "PerformanceDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
