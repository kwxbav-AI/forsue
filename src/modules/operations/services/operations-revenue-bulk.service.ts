import { prisma } from "@/lib/prisma";
import { formatDateOnly, toDateRangeTaipei, toDateRange } from "@/lib/date";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";
import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import {
  priorYearRevenueTargetByStoreMonth,
  sumTargetByMonth,
  sumTargetPerStore,
} from "@/modules/operations/services/operations-prior-year-target.service";

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

/** 營運 catalog 各月營收加總（單次查 revenueRecord，供月趨勢圖） */
export async function sumOpsCatalogRevenueByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const storeIds = filterStores.map((s) => s.id);
  if (storeIds.length === 0) return new Map();

  const { start, end } = toDateRange(startYmd, endYmd);
  const rows = await prisma.revenueRecord.findMany({
    where: { storeId: { in: storeIds }, revenueDate: { gte: start, lte: end } },
    select: { revenueDate: true, revenueAmount: true },
  });

  const monthTotals = new Map<string, number>();
  for (const r of rows) {
    const ym = formatDateOnly(r.revenueDate).slice(0, 7);
    const rev = Number(r.revenueAmount ?? 0);
    if (rev <= 0) continue;
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + rev);
  }
  return monthTotals;
}

/** 營運 catalog 區間營收目標合計（去年同月營收按工作天攤提） */
export async function sumOpsCatalogTargetForRange(
  startYmd: string,
  endYmd: string
): Promise<number> {
  const filterStores = await listPerformanceStoresForFilter();
  const byMonth = await sumTargetByMonthForPerformanceStores(
    startYmd,
    endYmd,
    filterStores.map((s) => s.id)
  );
  let total = 0;
  for (const v of byMonth.values()) total += v;
  return total;
}

/** 指定績效門市各月營收目標合計（去年同月營收按工作天攤提） */
export async function sumTargetByMonthForPerformanceStores(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, number>> {
  return sumTargetByMonth(
    await priorYearRevenueTargetByStoreMonth(startYmd, endYmd, perfStoreIds)
  );
}

/** 指定績效門市區間營收目標加總（去年同月營收按工作天攤提） */
export async function sumFullMonthTargetForPerformanceStores(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<number> {
  const byMonth = await sumTargetByMonthForPerformanceStores(startYmd, endYmd, perfStoreIds);
  let total = 0;
  for (const v of byMonth.values()) total += v;
  return total;
}

/**
 * 指定績效門市各月營收目標（按門市拆分，去年同月營收按工作天攤提）。
 * 回傳 Map<perfStoreId, Map<"YYYY-MM", target>>，供呼叫端依區域加總，避免重複查 DB。
 */
export async function sumTargetByMonthPerStore(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, Map<string, number>>> {
  return priorYearRevenueTargetByStoreMonth(startYmd, endYmd, perfStoreIds);
}

/** 各月營收目標合計（營運 catalog 全部門市） */
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

/** 各績效門市區間營收目標（去年同月營收按工作天攤提）→ Map<perfStoreId, total> */
export async function sumFullMonthTargetByPerformanceStore(
  startYmd: string,
  endYmd: string,
  perfStoreIds: string[]
): Promise<Map<string, number>> {
  return sumTargetPerStore(
    await priorYearRevenueTargetByStoreMonth(startYmd, endYmd, perfStoreIds)
  );
}

/** 桃+宜各月營收加總（單次查 revenueRecord，供月度業績趨勢圖使用） */
export async function sumDualRegionRevenueByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const dualStoreIds = filterStores
    .filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region))
    .map((s) => s.id);
  if (dualStoreIds.length === 0) return new Map();

  const { start, end } = toDateRange(startYmd, endYmd);
  const rows = await prisma.revenueRecord.findMany({
    where: { storeId: { in: dualStoreIds }, revenueDate: { gte: start, lte: end } },
    select: { revenueDate: true, revenueAmount: true },
  });

  const monthTotals = new Map<string, number>();
  for (const r of rows) {
    const ym = formatDateOnly(r.revenueDate).slice(0, 7);
    const rev = Number(r.revenueAmount ?? 0);
    if (rev <= 0) continue;
    monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + rev);
  }
  return monthTotals;
}

/** 桃+宜各月營收目標加總（去年同月營收按工作天攤提，供月度業績趨勢圖使用） */
export async function sumDualRegionFullMonthTargetByMonth(
  startYmd: string,
  endYmd: string
): Promise<Map<string, number>> {
  const filterStores = await listPerformanceStoresForFilter();
  const dualStoreIds = filterStores
    .filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region))
    .map((s) => s.id);
  return sumTargetByMonthForPerformanceStores(startYmd, endYmd, dualStoreIds);
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
