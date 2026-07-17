import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC, toDateRangeTaipei } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { countWorkingDaysInRangeUTC } from "@/lib/month-working-calendar";
import {
  fetchChartsPerStore,
  filterChartsByOpsCatalog,
  filterChartsByCatalogRegions,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { mapPerformanceToRetailStore } from "@/modules/operations/services/operations-dashboard-filter.service";
import { normalizeStoreKey, DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";

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

/** 營運 catalog 各月營收加總（與區間營業額相同：PerformanceDaily，供月趨勢圖） */
export async function sumOpsCatalogRevenueByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  const monthTotals = new Map<string, number>();

  for (const slice of slices) {
    const ym = `${slice.year}-${String(slice.month).padStart(2, "0")}`;
    const charts = await fetchChartsPerStore(slice.overlapStart, slice.overlapEnd);
    const filtered = filterChartsByOpsCatalog(charts);
    const revenue = filtered.reduce((a, r) => a + r.revenueSum, 0);
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + revenue);
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

  const retailIds = [...(await collectRetailIdsForTargets(storeIds, perfToRetail))];
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

async function collectRetailIdsForTargets(
  perfStoreIds: string[],
  perfToRetail: Awaited<ReturnType<typeof mapPerformanceToRetailStore>>
): Promise<Set<string>> {
  const ids = new Set([...perfToRetail.values()].map((v) => v.retailId));
  if (perfStoreIds.length === 0) return ids;

  const [perfStores, activeRetail] = await Promise.all([
    prisma.store.findMany({
      where: { id: { in: perfStoreIds } },
      select: { id: true, name: true },
    }),
    prisma.retailStore.findMany({
      where: { isActive: true },
      select: { id: true, storeName: true },
    }),
  ]);
  const retailIdByNameKey = new Map(
    activeRetail.map((r) => [normalizeStoreKey(r.storeName), r.id])
  );
  for (const s of perfStores) {
    const rid =
      perfToRetail.get(s.id)?.retailId ??
      retailIdByNameKey.get(normalizeStoreKey(s.name));
    if (rid) ids.add(rid);
  }
  return ids;
}

/** 回傳 retailId → perfStoreId 對應表（供 per-store 拆分使用） */
async function buildRetailToPerfStoreMap(
  perfStoreIds: string[],
  perfToRetail: Awaited<ReturnType<typeof mapPerformanceToRetailStore>>
): Promise<Map<string, string>> {
  const retailToPerfId = new Map<string, string>();
  for (const [perfId, { retailId }] of perfToRetail) {
    if (retailId) retailToPerfId.set(retailId, perfId);
  }
  const [perfStores, activeRetail] = await Promise.all([
    prisma.store.findMany({
      where: { id: { in: perfStoreIds } },
      select: { id: true, name: true },
    }),
    prisma.retailStore.findMany({
      where: { isActive: true },
      select: { id: true, storeName: true },
    }),
  ]);
  const retailIdByNameKey = new Map(
    activeRetail.map((r) => [normalizeStoreKey(r.storeName), r.id])
  );
  for (const s of perfStores) {
    const rid =
      perfToRetail.get(s.id)?.retailId ??
      retailIdByNameKey.get(normalizeStoreKey(s.name));
    if (rid && !retailToPerfId.has(rid)) retailToPerfId.set(rid, s.id);
  }
  return retailToPerfId;
}

/** 指定績效門市各月目標合計 */
export async function sumTargetByMonthForPerformanceStores(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, number>> {
  const storeIds = perfStoreIds;
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || storeIds.length === 0) return new Map();

  const [holidaySet, perfToRetail] = await Promise.all([
    loadHolidaySet(startYmd, endYmd),
    mapPerformanceToRetailStore(storeIds),
  ]);

  const retailIds = [...(await collectRetailIdsForTargets(storeIds, perfToRetail))];
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

/** 指定績效門市整月目標加總（不按工作天比例攤提，直接加總各月 salesTarget） */
export async function sumFullMonthTargetForPerformanceStores(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<number> {
  const storeIds = perfStoreIds;
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || storeIds.length === 0) return 0;

  const perfToRetail = await mapPerformanceToRetailStore(storeIds);
  const retailIds = [...(await collectRetailIdsForTargets(storeIds, perfToRetail))];
  if (retailIds.length === 0) return 0;

  const targetRows = await prisma.storeTarget.findMany({
    where: {
      storeId: { in: retailIds },
      OR: slices.map(({ year, month }) => ({ year, month })),
    },
    select: { salesTarget: true },
  });

  return targetRows.reduce((sum, r) => sum + Number(r.salesTarget ?? 0), 0);
}

/** 各月目標合計（營運 catalog 全部門市） */
export async function sumOpsCatalogTargetByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  return sumTargetByMonthForPerformanceStores(
    startYmd,
    endYmd,
    filterStores.map((s) => s.id)
  );
}

export function sumRevenueTotalsByMonth(
  byStoreMonth: Map<string, Map<string, number>>,
  storeIds: string[]
): Map<string, number> {
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

/** 各績效門市的整月目標（不攤提）→ Map<perfStoreId, total> */
export async function sumFullMonthTargetByPerformanceStore(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, number>> {
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || perfStoreIds.length === 0) return new Map();
  const perfToRetail = await mapPerformanceToRetailStore(perfStoreIds);
  const retailToPerfId = await buildRetailToPerfStoreMap(perfStoreIds, perfToRetail);
  const retailIds = [...retailToPerfId.keys()];
  if (retailIds.length === 0) return new Map();
  const targetRows = await prisma.storeTarget.findMany({
    where: {
      storeId: { in: retailIds },
      OR: slices.map(({ year, month }) => ({ year, month })),
    },
    select: { storeId: true, salesTarget: true },
  });
  const result = new Map<string, number>();
  for (const row of targetRows) {
    const perfId = retailToPerfId.get(row.storeId);
    if (!perfId) continue;
    result.set(perfId, (result.get(perfId) ?? 0) + Number(row.salesTarget ?? 0));
  }
  return result;
}

/** 桃+宜各月營收加總（只含 DUAL_OPS_REGIONS，供月度業績趨勢圖使用） */
export async function sumDualRegionRevenueByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  const monthTotals = new Map<string, number>();
  for (const slice of slices) {
    const ym = `${slice.year}-${String(slice.month).padStart(2, "0")}`;
    const charts = await fetchChartsPerStore(slice.overlapStart, slice.overlapEnd);
    const filtered = filterChartsByCatalogRegions(charts, DUAL_OPS_REGIONS);
    const revenue = filtered.reduce((a, r) => a + r.revenueSum, 0);
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + revenue);
  }
  return monthTotals;
}

/** 桃+宜各月整月目標加總（不攤提，供月度業績趨勢圖使用） */
export async function sumDualRegionFullMonthTargetByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const dualStoreIds = filterStores
    .filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region))
    .map((s) => s.id);
  const slices = listMonthSlicesInRange(startYmd, endYmd);
  if (slices.length === 0 || dualStoreIds.length === 0) return new Map();
  const perfToRetail = await mapPerformanceToRetailStore(dualStoreIds);
  const retailIds = [...(await collectRetailIdsForTargets(dualStoreIds, perfToRetail))];
  if (retailIds.length === 0) return new Map();
  const targetRows = await prisma.storeTarget.findMany({
    where: {
      storeId: { in: retailIds },
      OR: slices.map(({ year, month }) => ({ year, month })),
    },
    select: { year: true, month: true, salesTarget: true },
  });
  const byMonth = new Map<string, number>();
  for (const row of targetRows) {
    const ym = `${row.year}-${String(row.month).padStart(2, "0")}`;
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + Number(row.salesTarget ?? 0));
  }
  return byMonth;
}

/** 指定門市各月營收加總（單次 DB） */
export async function sumRevenueByMonthForPerformanceStores(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, number>> {
  if (perfStoreIds.length === 0) return new Map();
  const byStoreMonth = await fetchRevenueByStoreAndMonth(startYmd, endYmd, perfStoreIds);
  return sumRevenueTotalsByMonth(byStoreMonth, perfStoreIds);
}
