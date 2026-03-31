const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const TAIPEI_TZ = "Asia/Taipei";

function parseArgs() {
  const out = { dryRun: true, startDate: undefined, endDate: undefined };
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.split("=", 2);
    if (k === "--startDate") out.startDate = v;
    if (k === "--endDate") out.endDate = v;
    if (k === "--dryRun") out.dryRun = v !== "false";
  }
  return out;
}

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

function addDaysYmd(ymd, delta) {
  const d = parseDateOnlyUTC(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  const { startDate, endDate, dryRun } = parseArgs();
  const BATCH = 300;
  let updated = 0;
  const touched = new Set();

  console.log(
    `開始將 dispatchRecord.workDate +1 天（依台北日曆日）${dryRun ? " [DRY RUN]" : ""}...`
  );
  if (startDate || endDate) console.log(`範圍：${startDate ?? "∞"} ~ ${endDate ?? "∞"}`);

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
      const oldYmd = formatYmdInTaipei(r.workDate);
      if (startDate && oldYmd < startDate) continue;
      if (endDate && oldYmd > endDate) continue;

      const newYmd = addDaysYmd(oldYmd, 1);
      const newDate = parseDateOnlyUTC(newYmd);
      if (r.workDate.getTime() === newDate.getTime()) continue;
      updates.push({ id: r.id, newDate, oldYmd, newYmd });
    }

    if (updates.length === 0) continue;

    if (!dryRun) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.dispatchRecord.update({
            where: { id: u.id },
            data: { workDate: u.newDate },
          })
        )
      );
    }

    updated += updates.length;
    updates.forEach((u) => {
      touched.add(u.oldYmd);
      touched.add(u.newYmd);
    });
    console.log(`已處理 ${updated} 筆（本批 ${updates.length} 筆）`);
  }

  console.log(`完成。共${dryRun ? "預計" : ""}更新 ${updated} 筆。受影響日數：${touched.size}`);
  if (dryRun) {
    console.log("DRY RUN 完成（未寫入 DB）。");
  } else {
    console.log(
      "若你需要重算績效，請在部署站呼叫 /api/performance/recalculate-daily（可傳 startDate/endDate）。"
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

