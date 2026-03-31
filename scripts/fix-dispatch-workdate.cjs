const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TAIPEI_TZ = "Asia/Taipei";

function formatYmdInTaipei(d) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) throw new Error(`無法格式化台北日期: ${d.toISOString()}`);
  return `${y}-${m}-${day}`;
}

function parseDateOnlyUTC(ymd) {
  const t = String(ymd).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) throw new Error(`無效日期格式: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

async function main() {
  const BATCH = 500;
  let fixed = 0;
  const touched = new Set();

  console.log("開始修復 dispatchRecord.workDate（以台灣日曆日校正成 UTC 0 點）...");

  for (let skip = 0; ; skip += BATCH) {
    const rows = await prisma.dispatchRecord.findMany({
      select: { id: true, workDate: true },
      orderBy: { createdAt: "asc" },
      skip,
      take: BATCH,
    });
    if (rows.length === 0) break;

    const updates = [];
    for (const r of rows) {
      const ymd = formatYmdInTaipei(r.workDate);
      const newDate = parseDateOnlyUTC(ymd);
      if (r.workDate.getTime() === newDate.getTime()) continue;
      updates.push({ id: r.id, newDate, ymd });
    }

    if (updates.length === 0) continue;
    await prisma.$transaction(
      updates.map((u) =>
        prisma.dispatchRecord.update({
          where: { id: u.id },
          data: { workDate: u.newDate },
        })
      )
    );

    fixed += updates.length;
    updates.forEach((u) => touched.add(u.ymd));
    console.log(`已修復 ${fixed} 筆（本批 ${updates.length} 筆）`);
  }

  console.log(`修復完成，共修復 ${fixed} 筆。受影響日數：${touched.size}`);
  console.log(
    "若你需要重算績效，請在部署站呼叫 /api/performance/recalculate-daily（可傳 startDate/endDate）。"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

