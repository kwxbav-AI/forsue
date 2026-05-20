import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { formatDateOnlyTaipei, parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { buildDashboardFilterResult } from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  countTargetMetDaysByStore,
  revenueAchievementBucket,
} from "@/modules/operations/services/operations-overview-enrich.service";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";

function monthsAgoEnd(months: number): { startYmd: string; endYmd: string } {
  const endYmd = formatDateOnlyTaipei();
  const end = parseDateOnlyUTC(endYmd);
  end.setUTCMonth(end.getUTCMonth() - (months - 1));
  end.setUTCDate(1);
  const startYmd = formatDateOnly(end);
  return { startYmd, endYmd };
}

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

async function monthMetricsLight(
  startYmd: string,
  endYmd: string,
  selection: { storeId?: string; region?: string }
) {
  const [perStore, filterStores] = await Promise.all([
    fetchChartsPerStore(startYmd, endYmd),
    listPerformanceStoresForFilter(),
  ]);

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
  months: 3 | 6 | 12;
  storeId?: string;
}) {
  const { startYmd, endYmd } = monthsAgoEnd(input.months);
  const monthsList = listMonthsInRange(startYmd, endYmd);
  const filterStores = await listPerformanceStoresForFilter();
  const selection = input.storeId ? { storeId: input.storeId } : {};

  const monthResults = await Promise.all(
    monthsList.map((m) => monthMetricsLight(m.start, m.end, selection))
  );

  const revenueTrend = monthsList.map((m, i) => ({
    label: m.label,
    actualRevenue: Math.round(monthResults[i].summary.revenue),
    targetRevenue: Math.round(monthResults[i].summary.revenueForecast ?? 0),
  }));

  const productivityTrend = monthsList.map((m, i) => {
    const r = monthResults[i].summary;
    const perCapita = r.laborHours > 0 ? r.revenue / r.laborHours : null;
    return {
      label: m.label,
      perCapita: perCapita != null ? Math.round(perCapita) : null,
    };
  });

  const regionalBenchmark = await Promise.all(
    DUAL_OPS_REGIONS.map(async (region) => {
      const regionResults = await Promise.all(
        monthsList.map((m) =>
          monthMetricsLight(m.start, m.end, { region, ...selection })
        )
      );
      return {
        region,
        months: monthsList.map((m, i) => ({
          label: m.label,
          actualRevenue: Math.round(regionResults[i].summary.revenue),
          targetRevenue: Math.round(regionResults[i].summary.revenueForecast ?? 0),
        })),
      };
    })
  );

  const latest = monthsList[monthsList.length - 1];
  const latestResult = monthResults[monthResults.length - 1];

  const latestMet =
    latest ?
      await countTargetMetDaysByStore(latest.start, latest.end)
    : new Map<string, number>();

  const storeRanking = filterStores
    .filter((s) => !input.storeId || s.id === input.storeId)
    .map((s) => ({
      storeId: s.id,
      storeName: s.storeName,
      region: s.region,
      targetMetDays: latestMet.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.targetMetDays - a.targetMetDays);

  let achievementSummary = { green: 0, yellow: 0, red: 0, total: 0 };
  if (latestResult) {
    for (const row of latestResult.stores) {
      const bucket = revenueAchievementBucket(row.revenueAchievementRate);
      if (bucket === "none") continue;
      achievementSummary.total += 1;
      if (bucket === "green") achievementSummary.green += 1;
      else if (bucket === "yellow") achievementSummary.yellow += 1;
      else achievementSummary.red += 1;
    }
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

  return {
    startDate: startYmd,
    endDate: endYmd,
    months: input.months,
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
