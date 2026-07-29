import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { buildDashboardFilterResult } from "@/modules/operations/services/operations-dashboard-filter.service";
import { revenueAchievementBucket } from "@/modules/operations/services/operations-overview-enrich.service";
import { countTargetMetDaysByStore } from "@/modules/performance/services/target-summary.service";
import {
  fetchRevenueByStoreAndMonth,
  sumRevenueTotalsByMonth,
  sumTargetByMonthPerStore,
} from "@/modules/operations/services/operations-revenue-bulk.service";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { aggregateStoreMetricsByMonth } from "@/modules/performance/services/performance-daily-range.service";

type FilterStore = Awaited<ReturnType<typeof listPerformanceStoresForFilter>>[number];

function listMonthsInRange(startYmd: string, endYmd: string) {
  const out: { year: number; month: number; label: string; start: string; end: string }[] =
    [];
  const [sy, sm] = startYmd.split("-").map(Number);
  const [ey, em] = endYmd.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const { startYmd: ms, endYmd: me } = monthStartEndYmd(y, m);
    const start = startYmd > ms ? startYmd : ms;
    const end = endYmd < me ? endYmd : me;
    out.push({ year: y, month: m, label: `${y}/${m}月`, start, end });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function resolveActiveStoreIds(
  filterStores: FilterStore[],
  input: { storeId?: string; region?: string }
): string[] {
  if (input.storeId) return [input.storeId];
  if (input.region) {
    return filterStores.filter((s) => s.region === input.region).map((s) => s.id);
  }
  return filterStores.map((s) => s.id);
}

function selectionFromInput(input: { storeId?: string; region?: string }) {
  return {
    storeId: input.storeId,
    region: input.storeId ? undefined : input.region,
  };
}

async function rangeMetrics(
  startYmd: string,
  endYmd: string,
  selection: { storeId?: string; region?: string },
  filterStores: FilterStore[]
) {
  const perStore = await fetchChartsPerStore(startYmd, endYmd);
  return buildDashboardFilterResult({
    perStore,
    priorPerStore: [],
    startYmd,
    endYmd,
    filterLabel: "",
    storeCount: filterStores.length,
    selection,
    applyOpsCatalogWhenEmpty: !selection.storeId,
    skipDailyTrend: true,
  });
}

export async function buildPerformanceAnalysis(input: {
  startYmd: string;
  endYmd: string;
  storeId?: string;
  region?: string;
}) {
  const { startYmd, endYmd } = input;
  const filterStores = await listPerformanceStoresForFilter();
  const activeStoreIds = resolveActiveStoreIds(filterStores, input);
  const selection = selectionFromInput(input);
  const monthsList = listMonthsInRange(startYmd, endYmd);

  const catalogStoreIds = filterStores.map((s) => s.id);

  // 一次查所有門市目標，供 activeStoreIds 合計與各區域分組共用，避免重複打 DB
  const [byStoreMonth, allStoreTargetsByMonth, rangeResult, metDaysMap] = await Promise.all([
    fetchRevenueByStoreAndMonth(startYmd, endYmd, catalogStoreIds),
    sumTargetByMonthPerStore(startYmd, endYmd, catalogStoreIds),
    rangeMetrics(startYmd, endYmd, selection, filterStores),
    countTargetMetDaysByStore(startYmd, endYmd, activeStoreIds),
  ]);

  const targetByMonth = new Map<string, number>();
  for (const storeId of activeStoreIds) {
    const storeTargets = allStoreTargetsByMonth.get(storeId);
    if (!storeTargets) continue;
    for (const [ym, target] of storeTargets) {
      targetByMonth.set(ym, (targetByMonth.get(ym) ?? 0) + target);
    }
  }

  const targetByRegion = new Map<string, Map<string, number>>(
    DUAL_OPS_REGIONS.map((region) => {
      const regionIds = filterStores.filter((s) => s.region === region).map((s) => s.id);
      const byMonth = new Map<string, number>();
      for (const storeId of regionIds) {
        const storeTargets = allStoreTargetsByMonth.get(storeId);
        if (!storeTargets) continue;
        for (const [ym, target] of storeTargets) {
          byMonth.set(ym, (byMonth.get(ym) ?? 0) + target);
        }
      }
      return [region, byMonth];
    })
  );

  const revenueByMonth = sumRevenueTotalsByMonth(byStoreMonth, activeStoreIds);

  const revenueTrend = monthsList.map((m) => {
    const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
    return {
      label: m.label,
      actualRevenue: Math.round(revenueByMonth.get(ym) ?? 0),
      targetRevenue: Math.round(targetByMonth.get(ym) ?? 0),
    };
  });

  const rangeSummary = rangeResult.summary;
  const rangePerCapita =
    rangeSummary.laborHours > 0 ? rangeSummary.revenue / rangeSummary.laborHours : null;

  let productivityTrend: { label: string; perCapita: number | null }[];
  if (monthsList.length === 1) {
    productivityTrend = [
      {
        label: monthsList[0].label,
        perCapita: rangePerCapita != null ? Math.round(rangePerCapita) : null,
      },
    ];
  } else {
    // 整段區間只呼叫一次 DB（取代原本逐月各打一次 fetchChartsPerStore）
    const chartsByMonth = await aggregateStoreMetricsByMonth(startYmd, endYmd);
    productivityTrend = monthsList.map((m) => {
      const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
      const rows = chartsByMonth.get(ym) ?? [];
      const filtered = selection.storeId
        ? rows.filter((r) => r.storeId === selection.storeId)
        : selection.region
        ? rows.filter((r) => {
            const meta = filterStores.find((s) => s.id === r.storeId);
            return meta?.region === selection.region;
          })
        : rows;
      const revenue = filtered.reduce((a, r) => a + r.revenueSum, 0);
      const laborHours = filtered.reduce((a, r) => a + r.hoursSum, 0);
      return {
        label: m.label,
        perCapita: laborHours > 0 ? Math.round(revenue / laborHours) : null,
      };
    });
  }

  const regionalBenchmark = DUAL_OPS_REGIONS.map((region) => {
    const regionIds = filterStores.filter((s) => s.region === region).map((s) => s.id);
    const regionRevenueByMonth = sumRevenueTotalsByMonth(byStoreMonth, regionIds);
    const targets = targetByRegion.get(region);
    return {
      region,
      months: monthsList.map((m) => {
        const ym = `${m.year}-${String(m.month).padStart(2, "0")}`;
        return {
          label: m.label,
          actualRevenue: Math.round(regionRevenueByMonth.get(ym) ?? 0),
          targetRevenue: Math.round(targets?.get(ym) ?? 0),
        };
      }),
    };
  });

  const rankingStores = filterStores.filter((s) => {
    if (input.storeId) return s.id === input.storeId;
    if (input.region) return s.region === input.region;
    return true;
  });

  const storeRanking = rankingStores
    .map((s) => ({
      storeId: s.id,
      storeName: s.storeName,
      region: s.region,
      targetMetDays: metDaysMap.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.targetMetDays - a.targetMetDays);

  let achievementSummary = { green: 0, yellow: 0, red: 0, total: 0 };
  const achievementStores: {
    green: string[];
    yellow: string[];
    red: string[];
  } = { green: [], yellow: [], red: [] };

  for (const row of rangeResult.stores) {
    const bucket = revenueAchievementBucket(row.revenueAchievementRate);
    if (bucket === "none") continue;
    achievementSummary.total += 1;
    if (bucket === "green") {
      achievementSummary.green += 1;
      achievementStores.green.push(row.storeName);
    } else if (bucket === "yellow") {
      achievementSummary.yellow += 1;
      achievementStores.yellow.push(row.storeName);
    } else if (bucket === "red") {
      achievementSummary.red += 1;
      achievementStores.red.push(row.storeName);
    }
  }

  const pctOne = (n: number, total: number) =>
    total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

  const greenPct = pctOne(achievementSummary.green, achievementSummary.total);
  const yellowPct = pctOne(achievementSummary.yellow, achievementSummary.total);
  const redPct = pctOne(achievementSummary.red, achievementSummary.total);

  const latest = monthsList[monthsList.length - 1];

  return {
    startDate: startYmd,
    endDate: endYmd,
    region: input.region ?? null,
    storeId: input.storeId ?? null,
    stores: filterStores,
    revenueTrend,
    productivityTrend,
    regionalBenchmark,
    storeRanking,
    achievementSummary: {
      ...achievementSummary,
      greenPct,
      yellowPct,
      redPct,
      achievementStores,
      monthLabel: latest?.label ?? "",
    },
  };
}
