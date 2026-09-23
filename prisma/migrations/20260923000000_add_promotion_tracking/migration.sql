-- CreateTable
CREATE TABLE IF NOT EXISTS "EmployeePromotionTracking" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currentGrade" TEXT NOT NULL,
    "targetGrade" TEXT,
    "hoursRequired" DECIMAL(8,2),
    "hoursCarryOver" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carryOverDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePromotionTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PromotionExamRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "examDate" DATE NOT NULL,
    "fromGrade" TEXT NOT NULL,
    "toGrade" TEXT NOT NULL,
    "hoursDeducted" DECIMAL(8,2) NOT NULL,
    "result" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionExamRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePromotionTracking_employeeId_key" ON "EmployeePromotionTracking"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionExamRecord_employeeId_examDate_idx" ON "PromotionExamRecord"("employeeId", "examDate");

-- AddForeignKey
ALTER TABLE "EmployeePromotionTracking" ADD CONSTRAINT "EmployeePromotionTracking_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionExamRecord" ADD CONSTRAINT "PromotionExamRecord_emp_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionExamRecord" ADD CONSTRAINT "PromotionExamRecord_tracking_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeePromotionTracking"("employeeId") ON DELETE RESTRICT ON UPDATE CASCADE;
