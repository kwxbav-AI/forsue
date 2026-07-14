import { countTargetMetDaysByStore } from "@/modules/performance/services/target-summary.service";
import { aggregateCustomerMetricsForRetailIds } from "@/modules/operations/services/operations-customer-metrics.service";
import { mapPerformanceToRetailStore } from "@/modules/operations/services/operations-dashboard-filter.service";
import { formatDateOnly, parseDateOnlyUTC, toDateRange } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { yoyGrowthRate } from "@/lib/operations-yoy";
import { buildDashboardFilterResult } from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  sumOpsCatalogRevenueByMonth,
  sumOpsCatalogTargetByMonth,
} from "@/modules/operations/services/operations-revenue-bulk.service";
import {
  DUAL_OPS_REGIONS,
} from "@/lib/operations-dashboard";
import {
  fetchChartsPerStore,
  filterChartsByCatalogRegions,
  fetchDualRegionChartTotals,
  fetchRegionChartTotals,
  fetchDualRegionRevenueTotal,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { sumTargetByMonthForPerformanceStores } from "@/modules/operations/services/operations-revenue-bulk.service";
import { formatDateOnlyTaipei } from "@/lib/date";

export type RevenueAchievementBucket = "green" | "yellow" | "red" | "none";

export function revenueAchievementBucket(
  rate: number | null
): RevenueAchievementBucket {
  if (rate == null || !Number.isFinite(rate)) return "none";
  if (rate >= 100) return "green";
  if (rate >= 80) return "yellow";
  return "red";
}

export const REVENUE_ACHIEVEMENT_LABEL: Record<RevenueAchievementBucket, string> = {
  green: "達標",
  yellow: "接近達標",
  red: "未達標",
  none: "無目標",
};

function roundHours(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 正班工時：實際工時與區間目標工時取較小者 */
function computeRegularLaborHours(
  laborHours: number,
  periodLaborHourTarget: number | null,
  overtimeHours: number | null
): number | null {
  if (periodLaborHourTarget != null && periodLaborHourTarget > 0) {
    return roundHours(Math.min(laborHours, periodLaborHourTarget));
  }
  if (overtimeHours != null) {
    return roundHours(Math.max(0, laborHours - overtimeHours));
  }
  return laborHours > 0 ? roundHours(laborHours) : null;
}

/** 加班率 = 加班時數 ÷ 區間目標工時（原時數） */
function computeOvertimeRateOnTarget(
  overtimeHours: number | null,
  periodLaborHourTarget: number | null
): number | null {
  if (overtimeHours == null || periodLaborHourTarget == null || periodLaborHourTarget <= 0) {
    return null;
  }
  return Math.round((overtimeHours / periodLaborHourTarget) * 1000) / 10;
}

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
}

function listMonthsInRange(startYmd: string, endYmd: string) {
  const out: {
    year: number;
    month: number;
    label: string;
    sliceStart: string;
    sliceEnd: string;
  }[] = [];
  const [sy, sm] = startYmd.split("-").map(Number);
  const [ey, em] = endYmd.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const { startYmd: ms, endYmd: me } = monthStartEndYmd(y, m);
    const sliceStart = startYmd > ms ? startYmd : ms;
    const sliceEnd = endYmd < me ? endYmd : me;
    if (sliceStart <= sliceEnd) {
      out.push({
        year: y,
        month: m,
        label: `${y}/${m}月`,
        sliceStart,
        sliceEnd,
      });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

let kpiMetricsCache: {
  key: string;
  expiresAt: number;
  data: Awaited<ReturnType<typeof buildOpsKpiMetricsUncached>>;
} | null = null;

const KPI_METRICS_CACHE_MS = 5 * 60 * 1000;

let ytdTrendCache: {
  key: string;
  expiresAt: number;
  data: Awaited<ReturnType<typeof buildMonthlyRevenueTrend>>;
} | null = null;

const YTD_TREND_CACHE_MS = 10 * 60 * 1000;

async function buildOpsKpiMetricsUncached(startYmd: string, endYmd: string, region?: string) {
  const priorStart = shiftYear(startYmd, -1);
  const priorEnd = shiftYear(endYmd, -1);

  const filterStores = await listPerformanceStoresForFilter();
  const scopedStores = region
    ? filterStores.filter((s) => s.region === region)
    : filterStores.filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region));
  const scopedStoreIds = scopedStores.map((s) => s.id);

  const [dualCurrent, currentRevenue, priorRevenue, targetByMonth] = await Promise.all([
    region ? fetchRegionChartTotals(startYmd, endYmd, region) : fetchDualRegionChartTotals(startYmd, endYmd),
    region
      ? fetchRevenueForStoreIds(scopedStoreIds, startYmd, endYmd)
      : fetchDualRegionRevenueTotal(startYmd, endYmd),
    region
      ? fetchRevenueForStoreIds(scopedStoreIds, priorStart, priorEnd)
      : fetchDualRegionRevenueTotal(priorStart, priorEnd),
    sumTargetByMonthForPerformanceStores(startYmd, endYmd, scopedStoreIds),
  ]);

  const totalTarget = [...targetByMonth.values()].reduce((a, b) => a + b, 0);
  const totalRevenue = currentRevenue;
  const revenueAchievementRate =
    totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 1000) / 10 : null;

  const regionLabel = region || "宜蘭區 + 桃園區";

  return {
    totalRevenue,
    totalTarget,
    revenueAchievementRate,
    totalLaborHours: dualCurrent.laborHours,
    efficiencyRatio: dualCurrent.efficiencyRatio,
    yoyGrowthRate: yoyGrowthRate(currentRevenue, priorRevenue),
    priorYearRevenue: priorRevenue,
    regionLabel,
    periodStartDate: startYmd,
    periodEndDate: endYmd,
  };
}

/** 指定門市 ID 列表的區間營收加總（供 YoY 區域篩選使用） */
async function fetchRevenueForStoreIds(
  storeIds: string[],
  startYmd: string,
  endYmd: string
): Promise<number> {
  if (storeIds.length === 0) return 0;
  const { start, end } = toDateRange(startYmd, endYmd);
  const grouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: { storeId: { in: storeIds }, revenueDate: { gte: start, lte: end } },
    _sum: { revenueAmount: true },
  });
  return grouped.reduce((acc, g) => acc + Number(g._sum.revenueAmount ?? 0), 0);
}

/** KPI 指標：依篩選日期區間與區域累計（5 分鐘快取） */
export async function buildOpsKpiMetrics(startYmd: string, endYmd: string, region?: string) {
  const key = `${startYmd}|${endYmd}|${region ?? ""}`;
  const now = Date.now();
  if (kpiMetricsCache && kpiMetricsCache.key === key && kpiMetricsCache.expiresAt > now) {
    return kpiMetricsCache.data;
  }
  const data = await buildOpsKpiMetricsUncached(startYmd, endYmd, region);
  kpiMetricsCache = { key, expiresAt: now + KPI_METRICS_CACHE_MS, data };
  return data;
}

/** 當年度 1 月 1 日至今的月度業績趨勢（不受總覽日期篩選影響，10 分鐘快取） */
export async function buildYearToDateMonthlyRevenueTrend() {
  const todayYmd = formatDateOnlyTaipei();
  const year = todayYmd.slice(0, 4);
  const key = `${year}|${todayYmd}`;
  const now = Date.now();
  if (ytdTrendCache && ytdTrendCache.key === key && ytdTrendCache.expiresAt > now) {
    return ytdTrendCache.data;
  }
  const startYmd = `${year}-01-01`;
  const data = await buildMonthlyRevenueTrend(startYmd, todayYmd);
  ytdTrendCache = { key, expiresAt: now + YTD_TREND_CACHE_MS, data };
  return data;
}

/** 月度業績趨勢：單次營收查詢 + 批次目標，避免每月重跑 dashboard filter */
export async function buildMonthlyRevenueTrend(startYmd: string, endYmd: string) {
  const months = listMonthsInRange(startYmd, endYmd).slice(-24);
  if (months.length === 0) return [];

  const trendStart = months[0].sliceStart;
  const trendEnd = months[months.length - 1].sliceEnd;

  const [revenueByMonth, targetByMonth] = await Promise.all([
    sumOpsCatalogRevenueByMonth(trendStart, trendEnd),
    sumOpsCatalogTargetByMonth(trendStart, trendEnd),
  ]);

  return months.map(({ year, month, label }) => {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const revenue = revenueByMonth.get(ym) ?? 0;
    const target = targetByMonth.get(ym) ?? 0;
    return {
      label,
      revenueWan: Math.round((revenue / 10000) * 10) / 10,
      achievementRate:
        target > 0 ? Math.round((revenue / target) * 1000) / 10 : null,
    };
  });
}

export async function buildEnrichedOverviewStores(input: {
  startYmd: string;
  endYmd: string;
  region?: string;
}) {
  const { startYmd, endYmd, region } = input;

  const filterStores = await listPerformanceStoresForFilter();
  const scopedFilterStores = region
    ? filterStores.filter((s) => s.region === region)
    : filterStores.filter((s) => (DUAL_OPS_REGIONS as readonly string[]).includes(s.region));
  const scopedStoreIds = scopedFilterStores.map((s) => s.id);

  const [allPerStore, metDaysMap, perfToRetail] = await Promise.all([
    fetchChartsPerStore(startYmd, endYmd),
    countTargetMetDaysByStore(startYmd, endYmd, scopedStoreIds),
    mapPerformanceToRetailStore(scopedStoreIds),
  ]);

  // 無 region 時（營運部Dashboard）限縮到桃園＋宜蘭，避免台北區滲入
  const perStore = region
    ? allPerStore
    : filterChartsByCatalogRegions(allPerStore, DUAL_OPS_REGIONS);

  const retailIds = [
    ...new Set([...perfToRetail.values()].map((v) => v.retailId).filter(Boolean)),
  ];

  const [filterResult, customerMetrics] = await Promise.all([
    buildDashboardFilterResult({
      perStore,
      priorPerStore: [],
      startYmd,
      endYmd,
      filterLabel: region || "全部",
      storeCount: scopedFilterStores.length,
      selection: region ? { region } : {},
      applyOpsCatalogWhenEmpty: true,
      skipDailyTrend: true,
      perfToRetailPreloaded: perfToRetail,
    }),
    aggregateCustomerMetricsForRetailIds(retailIds, startYmd, endYmd),
  ]);

  const metaByPerfId = new Map(filterStores.map((s) => [s.id, s]));

  const stores = filterResult.stores
    .map((row) => {
      const meta = metaByPerfId.get(row.storeId);
      const revenueAchievementRate = row.revenueAchievementRate;
      const bucket = revenueAchievementBucket(revenueAchievementRate);
      const periodLaborHourTarget = row.defaultLaborHours;
      const overtimeHours = row.overtimeHours;
      return {
        storeId: row.storeId,
        storeName: row.storeName,
        catalogKey: meta?.catalogKey,
        region: meta?.region ?? "",
        revenue: row.revenue,
        laborHours: row.laborHours,
        efficiencyRatio: row.efficiencyRatio,
        revenueTarget: row.revenueForecast,
        revenueAchievementRate,
        priorYearRevenue: row.priorYearRevenue,
        yoyGrowthRate: row.yoyGrowthRate,
        targetMetDays: metDaysMap.get(row.storeId) ?? 0,
        periodLaborHourTarget,
        regularLaborHours: computeRegularLaborHours(
          row.laborHours,
          periodLaborHourTarget,
          overtimeHours
        ),
        overtimeHours,
        overtimeRateOnTarget: computeOvertimeRateOnTarget(
          overtimeHours,
          periodLaborHourTarget
        ),
        status: bucket,
        statusLabel: REVENUE_ACHIEVEMENT_LABEL[bucket],
      };
    })
    .sort((a, b) => (b.revenueAchievementRate ?? 0) - (a.revenueAchievementRate ?? 0));

  return {
    stores,
    customerMetrics,
    workingDaysInRange: filterResult.workingDaysInRange,
  };
}
