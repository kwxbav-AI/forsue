import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sql = `
CREATE TABLE IF NOT EXISTS "EmployeePromotionTracking" (
  id TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "currentGrade" TEXT NOT NULL,
  "targetGrade" TEXT,
  "hoursRequired" DECIMAL(8,2),
  "hoursCarryOver" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "carryOverDate" DATE NOT NULL,
  note TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePromotionTracking_pkey" PRIMARY KEY (id),
  CONSTRAINT "EmployeePromotionTracking_employeeId_key" UNIQUE ("employeeId"),
  CONSTRAINT "EmployeePromotionTracking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"(id)
);
`;

try {
  await prisma.$executeRawUnsafe(sql);
  console.log('Table created successfully');
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await prisma.$disconnect();
}
