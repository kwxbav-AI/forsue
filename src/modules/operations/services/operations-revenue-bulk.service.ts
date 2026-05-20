import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC, toDateRangeTaipei } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { countWorkingDaysInRangeUTC } from "@/lib/month-working-calendar";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";
import { mapPerformanceToRetailStore } from "@/modules/operations/services/operations-dashboard-filter.service";

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

function prorateTargetForSlice(
  retailStoreId: string,
  slice: MonthSlice,
  targets: Array<{ storeId: string; year: number; month: number; salesTarget: unknown }>,
  holidaySet: Set<string>
): number {
  const row = targets.find(
    (t) => t.storeId === retailStoreId && t.year === slice.year && t.month === slice.month
  );
  if (!row) return 0;
  const { startYmd: ms, endYmd: me } = monthStartEndYmd(slice.year, slice.month);
  const monthWd = countWorkingDaysInRangeUTC(ms, me, holidaySet);
  const overlapWd = countWorkingDaysInRangeUTC(
    slice.overlapStart,
    slice.overlapEnd,
    holidaySet
  );
  if (monthWd <= 0 || overlapWd <= 0) return 0;
  return Number(row.salesTarget) * (overlapWd / monthWd);
}

/** 一次查詢區間內各月營收（依門市 storeId 分組的 YYYY-MM） */
export async function fetchRevenueByStoreAndMonth(
  startYmd: string,
  endYmd: string,
  storeIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const byStoreMonth = new Map<string, Map<string, number>>();
  if (storeIds.length === 0) return byStoreMonth;

  const { start, end } = toDateRangeTaipei(startYmd, endYmd);
  const rows = await prisma.revenueRecord.findMany({
    where: {
      storeId: { in: storeIds },
      revenueDate: { gte: start, lte: end },
    },
    select: { storeId: true, revenueDate: true, revenueAmount: true },
  });

  for (const r of rows) {
    const ym = formatDateOnly(r.revenueDate).slice(0, 7);
    const rev = Number(r.revenueAmount ?? 0);
    if (rev <= 0) continue;
    let monthMap = byStoreMonth.get(r.storeId);
    if (!monthMap) {
      monthMap = new Map();
      byStoreMonth.set(r.storeId, monthMap);
    }
    monthMap.set(ym, (monthMap.get(ym) ?? 0) + rev);
  }
  return byStoreMonth;
}

/** 營運 catalog 各月營收加總（單次 DB + 記憶體分月，供月趨勢圖） */
export async function sumOpsCatalogRevenueByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const storeIds = filterStores.map((s) => s.id);
  const byStoreMonth = await fetchRevenueByStoreAndMonth(startYmd, endYmd, storeIds);

  const monthTotals = new Map<string, number>();
  for (const storeId of storeIds) {
    const monthMap = byStoreMonth.get(storeId);
    if (!monthMap) continue;
    for (const [ym, rev] of monthMap) {
      monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + rev);
    }
  }
  return monthTotals;
}

/** 營運 catalog 區間目標合計（批次載入 storeTarget） */
export async function sumOpsCatalogTargetForRange(
  startYmd: string,
  endYmd: string
): Promise<number> {
  const filterStores = await listPerformanceStoresForFilter();
  const storeIds = filterStores.map((s) => s.id);
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || storeIds.length === 0) return 0;

  const [holidaySet, perfToRetail] = await Promise.all([
    loadHolidaySet(startYmd, endYmd),
    mapPerformanceToRetailStore(storeIds),
  ]);

  const retailIds = [...new Set([...perfToRetail.values()].map((v) => v.retailId))];
  if (retailIds.length === 0) return 0;

  const targetRows = await prisma.storeTarget.findMany({
    where: {
      storeId: { in: retailIds },
      OR: slices.map(({ year, month }) => ({ year, month })),
    },
    select: { storeId: true, year: true, month: true, salesTarget: true },
  });

  let total = 0;
  for (const slice of slices) {
    for (const retailId of retailIds) {
      total += prorateTargetForSlice(retailId, slice, targetRows, holidaySet);
    }
  }
  return total;
}

/** 各月目標合計（營運 catalog） */
export async function sumOpsCatalogTargetByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const storeIds = filterStores.map((s) => s.id);
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || storeIds.length === 0) return new Map();

  const [holidaySet, perfToRetail] = await Promise.all([
    loadHolidaySet(startYmd, endYmd),
    mapPerformanceToRetailStore(storeIds),
  ]);

  const retailIds = [...new Set([...perfToRetail.values()].map((v) => v.retailId))];
  const targetRows =
    retailIds.length > 0 ?
      await prisma.storeTarget.findMany({
        where: {
          storeId: { in: retailIds },
          OR: slices.map(({ year, month }) => ({ year, month })),
        },
        select: { storeId: true, year: true, month: true, salesTarget: true },
      })
    : [];

  const byMonth = new Map<string, number>();
  for (const slice of slices) {
    const ym = `${slice.year}-${String(slice.month).padStart(2, "0")}`;
    let monthTarget = 0;
    for (const retailId of retailIds) {
      monthTarget += prorateTargetForSlice(retailId, slice, targetRows, holidaySet);
    }
    byMonth.set(ym, monthTarget);
  }
  return byMonth;
}
