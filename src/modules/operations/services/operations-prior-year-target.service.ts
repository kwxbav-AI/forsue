import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC, toDateRange } from "@/lib/date";
import { countWorkingDaysInRangeUTC, monthStartEndYmd } from "@/lib/month-working-calendar";

type MonthSlice = { year: number; month: number; overlapStart: string; overlapEnd: string };

function listMonthSlicesInRange(startYmd: string, endYmd: string): MonthSlice[] {
  const slices: MonthSlice[] = [];
  const [sy, sm] = startYmd.split("-").map(Number);
  const [ey, em] = endYmd.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const { startYmd: ms, endYmd: me } = monthStartEndYmd(y, m);
    const overlapStart = startYmd > ms ? startYmd : ms;
    const overlapEnd = endYmd < me ? endYmd : me;
    if (overlapStart <= overlapEnd) {
      slices.push({ year: y, month: m, overlapStart, overlapEnd });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return slices;
}

function ymKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function loadHolidaySet(startYmd: string, endYmd: string): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: {
        gte: parseDateOnlyUTC(startYmd),
        lte: parseDateOnlyUTC(endYmd),
      },
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => formatDateOnly(h.date)));
}

/**
 * 營收目標 = 去年同月整月營收 × (區間內工作天 ÷ 當月工作天)。
 * 不再使用 StoreTarget.salesTarget；去年同月無營收的門市不給目標。
 * 回傳 Map<perfStoreId, Map<"YYYY-MM"（今年月份）, target>>。
 */
export async function priorYearRevenueTargetByStoreMonth(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || perfStoreIds.length === 0) return result;

  const first = slices[0];
  const last = slices[slices.length - 1];
  const priorStartYmd = monthStartEndYmd(first.year - 1, first.month).startYmd;
  const priorEndYmd = monthStartEndYmd(last.year - 1, last.month).endYmd;
  // 營收以 UTC 日曆日寫入 @db.Date，須用 UTC 區間（見 CLAUDE.md）
  const { start, end } = toDateRange(priorStartYmd, priorEndYmd);

  const [rows, holidaySet] = await Promise.all([
    prisma.revenueRecord.findMany({
      where: { storeId: { in: perfStoreIds }, revenueDate: { gte: start, lte: end } },
      select: { storeId: true, revenueDate: true, revenueAmount: true },
    }),
    // 需涵蓋整月假日，才能算出當月工作天
    loadHolidaySet(
      monthStartEndYmd(first.year, first.month).startYmd,
      monthStartEndYmd(last.year, last.month).endYmd
    ),
  ]);

  const priorByStoreMonth = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const rev = Number(r.revenueAmount ?? 0);
    if (rev <= 0) continue;
    const ym = formatDateOnly(r.revenueDate).slice(0, 7);
    let monthMap = priorByStoreMonth.get(r.storeId);
    if (!monthMap) {
      monthMap = new Map();
      priorByStoreMonth.set(r.storeId, monthMap);
    }
    monthMap.set(ym, (monthMap.get(ym) ?? 0) + rev);
  }

  for (const slice of slices) {
    const { startYmd: ms, endYmd: me } = monthStartEndYmd(slice.year, slice.month);
    const monthWd = countWorkingDaysInRangeUTC(ms, me, holidaySet);
    const overlapWd = countWorkingDaysInRangeUTC(
      slice.overlapStart,
      slice.overlapEnd,
      holidaySet
    );
    if (monthWd <= 0 || overlapWd <= 0) continue;
    const ratio = overlapWd / monthWd;
    const priorYm = ymKey(slice.year - 1, slice.month);
    const ym = ymKey(slice.year, slice.month);

    for (const [storeId, monthMap] of priorByStoreMonth) {
      const priorRev = monthMap.get(priorYm) ?? 0;
      if (priorRev <= 0) continue;
      let storeMap = result.get(storeId);
      if (!storeMap) {
        storeMap = new Map();
        result.set(storeId, storeMap);
      }
      storeMap.set(ym, priorRev * ratio);
    }
  }
  return result;
}

/** 各門市區間目標合計 → Map<perfStoreId, total> */
export function sumTargetPerStore(
  byStoreMonth: Map<string, Map<string, number>>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [storeId, monthMap] of byStoreMonth) {
    let total = 0;
    for (const v of monthMap.values()) total += v;
    if (total > 0) out.set(storeId, total);
  }
  return out;
}

/** 多門市各月目標合計 → Map<"YYYY-MM", total> */
export function sumTargetByMonth(
  byStoreMonth: Map<string, Map<string, number>>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const monthMap of byStoreMonth.values()) {
    for (const [ym, v] of monthMap) out.set(ym, (out.get(ym) ?? 0) + v);
  }
  return out;
}
