-- CreateEnum
CREATE TYPE "StoreDeductionReason" AS ENUM ('EXPIRY', 'CLEANING', 'OTHER');

-- CreateTable
CREATE TABLE "StoreHourDeduction" (
    "id" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "reason" "StoreDeductionReason" NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreHourDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreHourDeduction_workDate_idx" ON "StoreHourDeduction"("workDate");

-- CreateIndex
CREATE INDEX "StoreHourDeduction_storeId_workDate_idx" ON "StoreHourDeduction"("storeId", "workDate");

-- AddForeignKey
ALTER TABLE "StoreHourDeduction" ADD CONSTRAINT "StoreHourDeduction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
