-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN     "isReserveStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reserveWorkPercent" DECIMAL(5,2);

