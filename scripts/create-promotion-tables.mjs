import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Create PromotionExamRecord table (EmployeePromotionTracking already exists)
try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PromotionExamRecord" (
      id TEXT NOT NULL,
      "employeeId" TEXT NOT NULL,
      "examDate" DATE NOT NULL,
      "fromGrade" TEXT NOT NULL,
      "toGrade" TEXT NOT NULL,
      "hoursDeducted" DECIMAL(8,2) NOT NULL,
      result TEXT,
      note TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PromotionExamRecord_pkey" PRIMARY KEY (id),
      CONSTRAINT "PromotionExamRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id),
      CONSTRAINT "PromotionExamRecord_trackingId_fkey" FOREIGN KEY ("employeeId") REFERENCES "EmployeePromotionTracking"("employeeId")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PromotionExamRecord_employeeId_examDate_idx"
      ON "PromotionExamRecord"("employeeId", "examDate")
  `);
  console.log('PromotionExamRecord table created');
} catch (e) {
  console.error(e.message);
} finally {
  await prisma.$disconnect();
}
