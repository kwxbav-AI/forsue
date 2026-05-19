import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { formatDateOnlyTaipei, parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import {
  buildDashboardFilterResult,
  fetchPriorYearChartsForFilter,
} from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  countTargetMetDaysByStore,
  revenueAchievementBucket,
} from "@/modules/operations/services/operations-overview-enrich.service";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
}

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
    out.push({ year: y, month: m, label: `${m}月`, start, end });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function monthMetrics(
  startYmd: string,
  endYmd: string,
  selection: { storeId?: string; region?: string }
) {
  const [perStore, priorPerStore, filterStores] = await Promise.all([
    fetchChartsPerStore(startYmd, endYmd),
    fetchPriorYearChartsForFilter(startYmd, endYmd, (ymd, d) => shiftYear(ymd, d)),
    listPerformanceStoresForFilter(),
  ]);

  return buildDashboardFilterResult({
    perStore,
    priorPerStore,
    startYmd,
    endYmd,
    filterLabel: "",
    storeCount: filterStores.length,
    selection,
    applyOpsCatalogWhenEmpty: !selection.storeId,
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

  const revenueTrend: {
    label: string;
    actualRevenue: number;
    targetRevenue: number;
  }[] = [];
  const productivityTrend: {
    label: string;
    perCapita: number | null;
  }[] = [];

  for (const m of monthsList) {
    const r = await monthMetrics(m.start, m.end, selection);
    revenueTrend.push({
      label: m.label,
      actualRevenue: Math.round(r.summary.revenue),
      targetRevenue: Math.round(r.summary.revenueForecast ?? 0),
    });
    const perCapita =
      r.summary.laborHours > 0 ? r.summary.revenue / r.summary.laborHours : null;
    productivityTrend.push({
      label: m.label,
      perCapita: perCapita != null ? Math.round(perCapita) : null,
    });
  }

  const regionalBenchmark: {
    region: string;
    months: { label: string; actualRevenue: number; targetRevenue: number }[];
  }[] = [];

  for (const region of DUAL_OPS_REGIONS) {
    const months: { label: string; actualRevenue: number; targetRevenue: number }[] = [];
    for (const m of monthsList) {
      const r = await monthMetrics(m.start, m.end, { region, ...selection });
      months.push({
        label: m.label,
        actualRevenue: Math.round(r.summary.revenue),
        targetRevenue: Math.round(r.summary.revenueForecast ?? 0),
      });
    }
    regionalBenchmark.push({ region, months });
  }

  const latest = monthsList[monthsList.length - 1];
  const latestMet = latest ?
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
  if (latest) {
    const latestResult = await monthMetrics(latest.start, latest.end, {});
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
