-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN IF NOT EXISTS "leaveDate" TIMESTAMP(3);
