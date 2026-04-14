-- AlterTable
ALTER TABLE "AttendanceRecord"
ADD COLUMN IF NOT EXISTS "scheduledWorkHours" DECIMAL(10,2);

