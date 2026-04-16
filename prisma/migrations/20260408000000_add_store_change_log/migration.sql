-- CreateTable
CREATE TABLE "StoreChangeLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreChangeLog_storeId_changedAt_idx" ON "StoreChangeLog"("storeId", "changedAt");

-- CreateIndex
CREATE INDEX "StoreChangeLog_changedAt_idx" ON "StoreChangeLog"("changedAt");

-- AddForeignKey
ALTER TABLE "StoreChangeLog" ADD CONSTRAINT "StoreChangeLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

