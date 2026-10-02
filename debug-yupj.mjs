import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const emps = await prisma.employee.findMany({
  where: { name: { contains: '游佩菁' } },
  select: { id: true, name: true, employeeCode: true, defaultStoreId: true, isReserveStaff: true, reserveWorkPercent: true, isActive: true },
});
console.log('=== 搜尋結果 ===');
console.log(JSON.stringify(emps, null, 2));

await prisma.$disconnect();
