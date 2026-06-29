const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const rows = await prisma.attendanceRecord.groupBy({
    by: ["workDate", "originalStoreId"],
    where: { workHours: { gt: 0 } },
    _count: { employeeId: true },
    orderBy: { _count: { employeeId: "desc" } },
    take: 10,
  });
  rows.forEach((r) =>
    console.log(r.workDate.toISOString().slice(0, 10), "人數:", r._count.employeeId)
  );
}
main().finally(() => prisma.$disconnect());
