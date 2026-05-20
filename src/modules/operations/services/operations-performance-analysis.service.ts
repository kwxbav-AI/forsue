import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { buildDashboardFilterResult } from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  countTargetMetDaysByStore,
  revenueAchievementBucket,
} from "@/modules/operations/services/operations-overview-enrich.service";
import {
  fetchRevenueByStoreAndMonth,
  sumRevenueTotalsByMonth,
  sumTargetByMonthForPerformanceStores,
} from "@/modules/operations/services/operations-revenue-bulk.service";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";

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

  const [byStoreMonth, targetByMonth, rangeResult, metDaysMap] = await Promise.all([
    fetchRevenueByStoreAndMonth(startYmd, endYmd, catalogStoreIds),
    sumTargetByMonthForPerformanceStores(startYmd, endYmd, activeStoreIds),
    rangeMetrics(startYmd, endYmd, selection, filterStores),
    countTargetMetDaysByStore(startYmd, endYmd, activeStoreIds),
  ]);

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
    const monthLaborResults = await Promise.all(
      monthsList.map(async (m) => {
        const perStore = await fetchChartsPerStore(m.start, m.end);
        const filtered = selection.storeId ?
          perStore.filter((r) => r.storeId === selection.storeId)
        : selection.region ?
          perStore.filter((r) => {
            const meta = filterStores.find((s) => s.id === r.storeId);
            return meta?.region === selection.region;
          })
        : perStore;
        const revenue = filtered.reduce((a, r) => a + r.revenueSum, 0);
        const laborHours = filtered.reduce((a, r) => a + r.hoursSum, 0);
        return {
          label: m.label,
          perCapita: laborHours > 0 ? Math.round(revenue / laborHours) : null,
        };
      })
    );
    productivityTrend = monthLaborResults;
  }

  const dualRegionTargets = await Promise.all(
    DUAL_OPS_REGIONS.map(async (region) => {
      const regionIds = filterStores.filter((s) => s.region === region).map((s) => s.id);
      const targets = await sumTargetByMonthForPerformanceStores(
        startYmd,
        endYmd,
        regionIds
      );
      return { region, targets };
    })
  );
  const targetByRegion = new Map(dualRegionTargets.map((r) => [r.region, r.targets]));

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
  for (const row of rangeResult.stores) {
    const bucket = revenueAchievementBucket(row.revenueAchievementRate);
    if (bucket === "none") continue;
    achievementSummary.total += 1;
    if (bucket === "green") achievementSummary.green += 1;
    else if (bucket === "yellow") achievementSummary.yellow += 1;
    else achievementSummary.red += 1;
  }

  const greenPct =
    achievementSummary.total > 0 ?
      Math.round((achievementSummary.green / achievementSummary.total) * 100)
    : 0;
  const yellowPct =
    achievementSummary.total > 0 ?
      Math.round((achievementSummary.yellow / achievementSummary.total) * 100)
    : 0;
  const redPct =
    achievementSummary.total > 0 ?
      Math.round((achievementSummary.red / achievementSummary.total) * 100)
    : 0;

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
      monthLabel: latest?.label ?? "",
    },
  };
}
