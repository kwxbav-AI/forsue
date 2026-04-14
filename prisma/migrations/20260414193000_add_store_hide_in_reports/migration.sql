-- Add report-visibility flag for Store
ALTER TABLE "Store"
ADD COLUMN "hideInReports" BOOLEAN NOT NULL DEFAULT false;

