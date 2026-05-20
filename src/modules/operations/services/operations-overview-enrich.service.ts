import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { yoyGrowthRate } from "@/lib/operations-yoy";
import { buildDashboardFilterResult } from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  sumOpsCatalogRevenueByMonth,
  sumOpsCatalogTargetByMonth,
} from "@/modules/operations/services/operations-revenue-bulk.service";
import {
  fetchChartsPerStore,
  fetchDualRegionChartTotals,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { OPS_KPI_CUMULATIVE_START_YMD } from "@/lib/performance-metrics-range";
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

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
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

/** 區間內各門市工效比達標天數（排除週日與假日，與達標次數統計一致） */
export async function countTargetMetDaysByStore(
  startYmd: string,
  endYmd: string,
  storeIds?: string[]
): Promise<Map<string, number>> {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);
  const holidaySet = await loadHolidaySet(startYmd, endYmd);

  const rows = await prisma.performanceDaily.findMany({
    where: {
      workDate: { gte: start, lte: end },
      versionNo: 1,
      isTargetMet: true,
      ...(storeIds?.length ? { storeId: { in: storeIds } } : {}),
      store: { isActive: true },
    },
    select: { storeId: true, workDate: true },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    const ymd = formatDateOnly(r.workDate);
    if (r.workDate.getUTCDay() === 0 || holidaySet.has(ymd)) continue;
    counts.set(r.storeId, (counts.get(r.storeId) ?? 0) + 1);
  }
  return counts;
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

/** 宜蘭+桃園 KPI：2026-01-01 起累計至今日，YoY 以 chart 公式比較去年同期 */
export async function buildOpsKpiMetrics() {
  const todayYmd = formatDateOnlyTaipei();
  const kpiStart = OPS_KPI_CUMULATIVE_START_YMD;
  const kpiEnd = todayYmd > kpiStart ? todayYmd : kpiStart;
  const priorStart = shiftYear(kpiStart, -1);
  const priorEnd = shiftYear(kpiEnd, -1);

  const [dualCurrent, dualPrior] = await Promise.all([
    fetchDualRegionChartTotals(kpiStart, kpiEnd),
    fetchDualRegionChartTotals(priorStart, priorEnd),
  ]);

  return {
    totalRevenue: dualCurrent.revenue,
    totalLaborHours: dualCurrent.laborHours,
    efficiencyRatio: dualCurrent.efficiencyRatio,
    yoyGrowthRate: yoyGrowthRate(dualCurrent.revenue, dualPrior.revenue),
    priorYearRevenue: dualPrior.revenue,
    regionLabel: "宜蘭區 + 桃園區",
    periodStartDate: kpiStart,
    periodEndDate: kpiEnd,
  };
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
  const priorStart = shiftYear(startYmd, -1);
  const priorEnd = shiftYear(endYmd, -1);

  const [perStore, priorPerStore, filterStores, metDaysMap] = await Promise.all([
    fetchChartsPerStore(startYmd, endYmd),
    fetchChartsPerStore(priorStart, priorEnd),
    listPerformanceStoresForFilter(),
    countTargetMetDaysByStore(startYmd, endYmd),
  ]);

  const filterResult = await buildDashboardFilterResult({
    perStore,
    priorPerStore,
    startYmd,
    endYmd,
    filterLabel: region || "全部",
    storeCount: filterStores.length,
    selection: region ? { region } : {},
    applyOpsCatalogWhenEmpty: true,
    skipDailyTrend: true,
  });

  const metaByPerfId = new Map(filterStores.map((s) => [s.id, s]));

  return filterResult.stores
    .map((row) => {
      const meta = metaByPerfId.get(row.storeId);
      const revenueAchievementRate = row.revenueAchievementRate;
      const bucket = revenueAchievementBucket(revenueAchievementRate);
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
        status: bucket,
        statusLabel: REVENUE_ACHIEVEMENT_LABEL[bucket],
      };
    })
    .sort((a, b) => (b.revenueAchievementRate ?? 0) - (a.revenueAchievementRate ?? 0));
}
