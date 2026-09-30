-- CreateTable
CREATE TABLE "StoreTransferRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromStoreId" TEXT NOT NULL,
    "toStoreId" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "endDate" DATE,
    "allowanceType" TEXT NOT NULL,
    "baseMonthlyAmount" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreTransferRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreTransferRecord_employeeId_idx" ON "StoreTransferRecord"("employeeId");

-- CreateIndex
CREATE INDEX "StoreTransferRecord_transferDate_idx" ON "StoreTransferRecord"("transferDate");

-- AddForeignKey
ALTER TABLE "StoreTransferRecord" ADD CONSTRAINT "StoreTransferRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreTransferRecord" ADD CONSTRAINT "StoreTransferRecord_fromStoreId_fkey" FOREIGN KEY ("fromStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreTransferRecord" ADD CONSTRAINT "StoreTransferRecord_toStoreId_fkey" FOREIGN KEY ("toStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
