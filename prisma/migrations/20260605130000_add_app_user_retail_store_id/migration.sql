-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN "retail_store_id" TEXT;

-- CreateIndex
CREATE INDEX "AppUser_retail_store_id_idx" ON "AppUser"("retail_store_id");

-- AddForeignKey
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_retail_store_id_fkey" FOREIGN KEY ("retail_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
