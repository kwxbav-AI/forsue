-- CreateEnum
CREATE TYPE "ShiftPlanKind" AS ENUM ('WORK', 'OFF', 'HOLIDAY', 'LEAVE', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "UploadFileType" ADD VALUE 'SHIFT_ROSTER';

-- CreateTable
CREATE TABLE "StoreShiftPlan" (
    "id" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "storeId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT,
    "employeeId" TEXT,
    "shiftKind" "ShiftPlanKind" NOT NULL DEFAULT 'WORK',
    "startTime" TEXT,
    "endTime" TEXT,
    "scheduledHours" DECIMAL(10,2) NOT NULL,
    "rawCell" TEXT,
    "uploadBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreShiftPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreShiftPlan_workDate_idx" ON "StoreShiftPlan"("workDate");

-- CreateIndex
CREATE INDEX "StoreShiftPlan_storeId_workDate_idx" ON "StoreShiftPlan"("storeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "StoreShiftPlan_storeId_workDate_employeeCode_key" ON "StoreShiftPlan"("storeId", "workDate", "employeeCode");

-- AddForeignKey
ALTER TABLE "StoreShiftPlan" ADD CONSTRAINT "StoreShiftPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
