const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const code = process.argv[2] || "Y2604506";
    const name = process.argv[3] || "林玟華";
    const start = process.argv[4] || "2026-04-01";
    const end = process.argv[5] || "2026-04-16";

    const empByCode = await prisma.employee.findUnique({ where: { employeeCode: code } });
    console.log("empByCode", empByCode && {
      id: empByCode.id,
      code: empByCode.employeeCode,
      name: empByCode.name,
      isActive: empByCode.isActive,
      defaultStoreId: empByCode.defaultStoreId,
    });

    const empByName = await prisma.employee.findMany({
      where: { name: { contains: name } },
      select: { id: true, employeeCode: true, name: true, isActive: true, defaultStoreId: true },
      take: 10,
    });
    console.log("empByName", empByName);

    const rangeStart = new Date(`${start}T00:00:00+08:00`);
    const rangeEnd = new Date(`${end}T23:59:59+08:00`);

    if (empByCode) {
      const recs = await prisma.attendanceRecord.findMany({
        where: { employeeId: empByCode.id, workDate: { gte: rangeStart, lte: rangeEnd } },
        select: {
          id: true,
          workDate: true,
          workHours: true,
          originalStoreId: true,
          department: true,
          locationMatchStatus: true,
          uploadBatchId: true,
        },
        orderBy: { workDate: "asc" },
        take: 100,
      });
      console.log("attendanceByEmpCount", recs.length);
      console.log("attendanceByEmpSample", recs.slice(0, 10).map((r) => ({
        id: r.id,
        workDate: r.workDate.toISOString(),
        workHours: r.workHours.toString(),
        originalStoreId: r.originalStoreId,
        department: r.department,
        match: r.locationMatchStatus,
        uploadBatchId: r.uploadBatchId,
      })));

      const storeIds = [...new Set(recs.map((r) => r.originalStoreId).filter(Boolean))];
      if (storeIds.length > 0) {
        const stores = await prisma.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true, department: true, hideInReports: true, isActive: true },
        });
        console.log("storesOfRecords", stores);
      }
    }

    const reportLike = await prisma.attendanceRecord.findMany({
      where: {
        workDate: { gte: rangeStart, lte: rangeEnd },
        employee: { name: { contains: name } },
      },
      include: { employee: true, store: true },
      take: 20,
      orderBy: { workDate: "asc" },
    });
    console.log("reportLikeCount", reportLike.length);
    console.log("reportLikeSample", reportLike.slice(0, 10).map((r) => ({
      workDate: r.workDate.toISOString().slice(0, 10),
      empCode: r.employee.employeeCode,
      empName: r.employee.name,
      originalStoreId: r.originalStoreId,
      storeHidden: r.store ? r.store.hideInReports : null,
    })));
  } finally {
    // Ensure we always disconnect
    // eslint-disable-next-line no-unsafe-finally
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

