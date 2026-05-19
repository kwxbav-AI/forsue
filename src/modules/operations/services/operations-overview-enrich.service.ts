import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import {
  buildDashboardFilterResult,
  fetchPriorYearChartsForFilter,
} from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";

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
  const out: { year: number; month: number; label: string }[] = [];
  const [sy, sm] = startYmd.split("-").map(Number);
  const [ey, em] = endYmd.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m, label: `${m}月` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
}

export async function buildMonthlyRevenueTrend(startYmd: string, endYmd: string) {
  const months = listMonthsInRange(startYmd, endYmd);
  const trend: {
    year: number;
    month: number;
    label: string;
    revenueWan: number;
    achievementRate: number | null;
  }[] = [];

  for (const { year, month, label } of months) {
    const { startYmd: ms, endYmd: me } = monthStartEndYmd(year, month);
    const sliceStart = startYmd > ms ? startYmd : ms;
    const sliceEnd = endYmd < me ? endYmd : me;
    if (sliceStart > sliceEnd) continue;

    const perStore = await fetchChartsPerStore(sliceStart, sliceEnd);
    const priorPerStore = await fetchPriorYearChartsForFilter(
      sliceStart,
      sliceEnd,
      (ymd, delta) => shiftYear(ymd, delta)
    );
    const filterStores = await listPerformanceStoresForFilter();
    const result = await buildDashboardFilterResult({
      perStore,
      priorPerStore,
      startYmd: sliceStart,
      endYmd: sliceEnd,
      filterLabel: label,
      storeCount: filterStores.length,
      selection: {},
      applyOpsCatalogWhenEmpty: true,
    });

    const revenue = result.summary.revenue;
    const target = result.summary.revenueForecast;
    trend.push({
      year,
      month,
      label,
      revenueWan: Math.round((revenue / 10000) * 10) / 10,
      achievementRate:
        target != null && target > 0 ?
          Math.round((revenue / target) * 1000) / 10
        : null,
    });
  }

  return trend;
}

export async function buildEnrichedOverviewStores(input: {
  startYmd: string;
  endYmd: string;
  region?: string;
}) {
  const { startYmd, endYmd, region } = input;
  const [perStore, priorPerStore, filterStores, metDaysMap] = await Promise.all([
    fetchChartsPerStore(startYmd, endYmd),
    fetchPriorYearChartsForFilter(startYmd, endYmd, (ymd, delta) =>
      shiftYear(ymd, delta)
    ),
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
        targetMetDays: metDaysMap.get(row.storeId) ?? 0,
        status: bucket,
        statusLabel: REVENUE_ACHIEVEMENT_LABEL[bucket],
      };
    })
    .sort((a, b) => (b.revenueAchievementRate ?? 0) - (a.revenueAchievementRate ?? 0));
}
