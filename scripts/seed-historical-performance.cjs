/**
 * 補齊 2025-01～2026-04 的 PerformanceDaily（versionNo=1），供「營收預估分析」歷史欄位有值。
 *
 * 營收為依門市 id／年月產生的穩定假資料（約數百萬級／月），僅供開發或示範；
 * 若需與實際試算表一致，請改以正式營收上傳或自訂 CSV 匯入取代。
 *
 * 預設：若該 storeId+workDate 已有 versionNo=1 列則略過（不覆寫）。
 * 強制刪除區間內既有 v1 再重建：FORCE_SEED_HISTORY=1
 *
 * 執行：node scripts/seed-historical-performance.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const RANGE_START = { y: 2025, m: 1 };
const RANGE_END = { y: 2026, m: 4 };

function formatDateOnly(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function parseDateOnlyUTC(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) throw new Error(`無效日期: ${ymd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0));
}

function monthStartEndYmd(year, month) {
  const startYmd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
  return { startYmd, endYmd: formatDateOnly(last) };
}

function countWorkingDaysInRangeUTC(startYmd, endYmd, holidayYmdSet) {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    if (d.getUTCDay() === 0) continue;
    if (holidayYmdSet.has(ymd)) continue;
    n++;
  }
  return n;
}

function* iterMonths(fromY, fromM, toY, toM) {
  let y = fromY;
  let m = fromM;
  for (;;) {
    yield { y, m };
    if (y === toY && m === toM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
}

function monthlyRevenueSeed(storeId, year, month) {
  let h = 0;
  for (const ch of storeId) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const mk = year * 100 + month;
  const wave = 0.9 + ((mk * 17 + h) % 25) * 0.012;
  const base = 2_100_000 + (h % 1_200_000);
  return Math.round(base * wave + month * 25_000);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function main() {
  const force = process.env.FORCE_SEED_HISTORY === "1" || process.env.FORCE_SEED_HISTORY === "true";
  const { startYmd: rangeStart } = monthStartEndYmd(RANGE_START.y, RANGE_START.m);
  const { endYmd: rangeEnd } = monthStartEndYmd(RANGE_END.y, RANGE_END.m);

  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (stores.length === 0) {
    console.log("無符合條件的門市（isActive 且未隱藏報表），結束。");
    return;
  }

  const storeIds = stores.map((s) => s.id);

  if (force) {
    const del = await prisma.performanceDaily.deleteMany({
      where: {
        versionNo: 1,
        workDate: { gte: parseDateOnlyUTC(rangeStart), lte: parseDateOnlyUTC(rangeEnd) },
        storeId: { in: storeIds },
      },
    });
    console.log(`FORCE：已刪除 ${del.count} 筆 PerformanceDaily（v1、區間內、上述門市）`);
  }

  const [holidays, targetRow] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: { gte: parseDateOnlyUTC(rangeStart), lte: parseDateOnlyUTC(rangeEnd) },
      },
      select: { date: true },
    }),
    prisma.performanceTargetSetting.findFirst({
      where: { isActive: true },
      orderBy: { effectiveStartDate: "desc" },
      select: { targetValue: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => formatDateOnly(h.date)));
  const targetValue = Number(targetRow?.targetValue ?? 4500);
  const totalWorkHours = 8;

  const existing = force
    ? []
    : await prisma.performanceDaily.findMany({
        where: {
          versionNo: 1,
          workDate: { gte: parseDateOnlyUTC(rangeStart), lte: parseDateOnlyUTC(rangeEnd) },
          storeId: { in: storeIds },
        },
        select: { storeId: true, workDate: true },
      });
  const existSet = new Set(existing.map((e) => `${e.storeId}|${formatDateOnly(e.workDate)}`));

  let inserted = 0;
  let skipped = 0;
  const chunk = [];

  for (const { y, m } of iterMonths(RANGE_START.y, RANGE_START.m, RANGE_END.y, RANGE_END.m)) {
    const { startYmd, endYmd } = monthStartEndYmd(y, m);
    const wdays = countWorkingDaysInRangeUTC(startYmd, endYmd, holidaySet);
    if (wdays === 0) continue;

    for (const store of stores) {
      const monthly = monthlyRevenueSeed(store.id, y, m);
      const dailyBase = monthly / wdays;

      for (let t = parseDateOnlyUTC(startYmd).getTime(); t <= parseDateOnlyUTC(endYmd).getTime(); t += 86400000) {
        const d = new Date(t);
        const ymd = formatDateOnly(d);
        if (d.getUTCDay() === 0) continue;
        if (holidaySet.has(ymd)) continue;

        const key = `${store.id}|${ymd}`;
        if (!force && existSet.has(key)) {
          skipped += 1;
          continue;
        }

        const dayJitter = 0.94 + ((ymd.charCodeAt(ymd.length - 1) + store.id.length) % 12) * 0.01;
        const revenueAmount = round2(dailyBase * dayJitter);
        const efficiencyRatio = round2(revenueAmount / totalWorkHours);

        chunk.push({
          workDate: parseDateOnlyUTC(ymd),
          storeId: store.id,
          revenueAmount,
          totalWorkHours,
          efficiencyRatio,
          targetValue,
          isTargetMet: false,
          versionNo: 1,
        });

        if (chunk.length >= 200) {
          const r = await prisma.performanceDaily.createMany({ data: chunk, skipDuplicates: true });
          inserted += r.count;
          chunk.length = 0;
        }
      }
    }
  }

  if (chunk.length > 0) {
    const r = await prisma.performanceDaily.createMany({ data: chunk, skipDuplicates: true });
    inserted += r.count;
  }

  console.log(
    `完成：門市 ${stores.length} 家、區間 ${rangeStart}～${rangeEnd}。寫入 ${inserted} 筆（略過重複）；略過既有 ${skipped} 筆。FORCE=${force}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
