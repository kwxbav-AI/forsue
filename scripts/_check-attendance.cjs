require("./load-env.cjs");
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function main() {
  const count = await p.attendanceRecord.count();
  console.log("total attendance records:", count);

  const sample = await p.attendanceRecord.findMany({
    where: { workHours: { gt: 0 } },
    select: {
      workDate: true,
      workHours: true,
      scheduledWorkHours: true,
      shiftType: true,
      startTime: true,
      endTime: true,
      originalStoreId: true,
      employee: { select: { defaultStoreId: true, employeeCode: true } },
    },
    take: 5,
    orderBy: { workDate: "desc" },
  });

  console.log("sample count:", sample.length);
  for (const r of sample) {
    console.log(JSON.stringify({
      date: r.workDate,
      wh: r.workHours?.toString(),
      scheduled: r.scheduledWorkHours?.toString(),
      shiftType: r.shiftType,
      start: r.startTime,
      end: r.endTime,
      origStore: r.originalStoreId,
      defStore: r.employee?.defaultStoreId,
      emp: r.employee?.employeeCode,
    }));
  }
}

main()
  .catch(e => { console.error("ERROR:", e.message); })
  .finally(() => p.$disconnect());
