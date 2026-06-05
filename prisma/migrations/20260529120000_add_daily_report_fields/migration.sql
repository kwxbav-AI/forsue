-- AlterTable
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "revenue" INTEGER;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "weather" TEXT;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "handover_note" TEXT;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "feedback" TEXT;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "restock_done" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "expiry_done" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "discount_items" (
    "id" TEXT NOT NULL,
    "daily_report_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "discount_items_daily_report_id_idx" ON "discount_items"("daily_report_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "discount_items" ADD CONSTRAINT "discount_items_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
