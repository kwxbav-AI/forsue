-- CreateTable
CREATE TABLE IF NOT EXISTS "EmployeeReserveStaffPeriod" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isReserveStaff" BOOLEAN NOT NULL,
    "reserveWorkPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeReserveStaffPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmployeeReserveStaffPeriod_employeeId_effectiveFrom_idx"
ON "EmployeeReserveStaffPeriod"("employeeId", "effectiveFrom");

CREATE INDEX IF NOT EXISTS "EmployeeReserveStaffPeriod_employeeId_effectiveFrom_effectiveTo_idx"
ON "EmployeeReserveStaffPeriod"("employeeId", "effectiveFrom", "effectiveTo");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeReserveStaffPeriod_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeeReserveStaffPeriod"
      ADD CONSTRAINT "EmployeeReserveStaffPeriod_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill one open period per existing employee so historical calculations
-- have a date-based setting immediately after migration.
INSERT INTO "EmployeeReserveStaffPeriod" (
  "id",
  "employeeId",
  "effectiveFrom",
  "effectiveTo",
  "isReserveStaff",
  "reserveWorkPercent",
  "createdAt",
  "updatedAt"
)
SELECT
  'reserve_' || e."id",
  e."id",
  COALESCE((SELECT MIN(a."workDate") FROM "AttendanceRecord" a WHERE a."employeeId" = e."id"), DATE '1970-01-01'),
  NULL,
  e."isReserveStaff",
  CASE WHEN e."isReserveStaff" THEN e."reserveWorkPercent" ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Employee" e
WHERE NOT EXISTS (
  SELECT 1 FROM "EmployeeReserveStaffPeriod" p WHERE p."employeeId" = e."id"
);
