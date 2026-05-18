import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { computeDailyMetricsByStoreResilient } from "@/modules/performance/services/daily-store-metrics.service";
import {
  countWorkingDaysInRangeUTC,
  monthStartEndYmd,
} from "@/lib/month-working-calendar";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";
import {
  type ChartsPerStoreRow,
  fetchChartsPerStore,
  filterChartsByOpsCatalog,
  filterChartsBySelection,
  metricsFromChartRows,
} from "./operations-metrics.service";

export type DashboardFilterStoreRow = {
  storeId: string;
  storeName: string;
  revenue: number;
  laborHours: number;
  efficiencyRatio: number | null;
  revenueForecast: number | null;
  revenueAchievement: number;
  revenueAchievementRate: number | null;
  yoyGrowthRate: number | null;
  priorYearRevenue: number;
  actualAttendanceHours: number;
  overtimeHours: number | null;
  overtimeRatio: number | null;
  /** 人工設定：每日營業時長 */
  dailyBusinessHours: number | null;
  /** 篩選區間預設工時合計（每日預設工時 × 工作天數） */
  defaultLaborHours: number | null;
};

export type DashboardDailyTrendPoint = {
  date: string;
  label: string;
  revenue: number;
  laborHours: number;
};

export type DashboardFilterResult = {
  filterLabel: string;
  storeCount: number;
  matchedStoreCount: number;
  hasData: boolean;
  workingDaysInRange: number;
  summary: DashboardFilterStoreRow;
  stores: DashboardFilterStoreRow[];
  dailyTrend: DashboardDailyTrendPoint[];
};

type MonthSlice = { year: number; month: number; overlapStart: string; overlapEnd: string };

type RetailLaborSettings = {
  dailyBusinessHours: number | null;
  defaultLaborHoursPerDay: number | null;
};

type StoreMetricsContext = {
  salesForecast: number;
  labor: RetailLaborSettings;
  periodDefaultLaborHours: number | null;
};

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

function pctRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

function yoyRate(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior <= 0) return null;
  return ((current - prior) / prior) * 100;
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
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

async function mapPerformanceToRetailStore(
  performanceStoreIds: string[]
): Promise<Map<string, { retailId: string; settings: RetailLaborSettings }>> {
  if (performanceStoreIds.length === 0) return new Map();

  const perfStores = await prisma.store.findMany({
    where: { id: { in: performanceStoreIds } },
    select: { id: true, name: true },
  });

  const retailStores = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: {
      id: true,
      storeName: true,
      dailyBusinessHours: true,
      defaultLaborHoursPerDay: true,
    },
  });
  const retailByExactName = new Map(
    retailStores.map((r) => [r.storeName.trim(), r])
  );

  const out = new Map<string, { retailId: string; settings: RetailLaborSettings }>();
  for (const s of perfStores) {
    let retail = retailByExactName.get(s.name.trim());
    if (!retail) {
      const perfKey = normalizeStoreKey(s.name);
      retail = retailStores.find(
        (r) =>
          normalizeStoreKey(r.storeName) === perfKey ||
          storeNameMatchesCatalogKey(r.storeName, perfKey) ||
          storeNameMatchesCatalogKey(s.name, r.storeName)
      );
    }
    if (!retail) continue;
    out.set(s.id, {
      retailId: retail.id,
      settings: {
        dailyBusinessHours: toOptionalNumber(retail.dailyBusinessHours),
        defaultLaborHoursPerDay: toOptionalNumber(retail.defaultLaborHoursPerDay),
      },
    });
  }
  return out;
}

function prorateSalesForecastFromTargets(
  retailStoreId: string,
  slices: MonthSlice[],
  targets: Array<{
    storeId: string;
    year: number;
    month: number;
    salesTarget: unknown;
  }>,
  holidaySet: Set<string>
): number {
  const targetByYm = new Map(
    targets
      .filter((t) => t.storeId === retailStoreId)
      .map((t) => [`${t.year}-${t.month}`, t] as const)
  );

  let salesForecast = 0;
  for (const slice of slices) {
    const row = targetByYm.get(`${slice.year}-${slice.month}`);
    if (!row) continue;

    const { startYmd: ms, endYmd: me } = monthStartEndYmd(slice.year, slice.month);
    const monthWd = countWorkingDaysInRangeUTC(ms, me, holidaySet);
    const overlapWd = countWorkingDaysInRangeUTC(
      slice.overlapStart,
      slice.overlapEnd,
      holidaySet
    );
    if (monthWd <= 0 || overlapWd <= 0) continue;

    salesForecast += Number(row.salesTarget) * (overlapWd / monthWd);
  }
  return salesForecast;
}

function periodDefaultLaborHours(
  settings: RetailLaborSettings,
  workingDaysInRange: number
): number | null {
  if (
    settings.defaultLaborHoursPerDay == null ||
    workingDaysInRange <= 0
  ) {
    return null;
  }
  return settings.defaultLaborHoursPerDay * workingDaysInRange;
}

function computeOvertimeHours(
  actualHours: number,
  periodDefault: number | null
): number | null {
  if (periodDefault == null) return null;
  return actualHours - periodDefault;
}

function buildStoreRow(
  chart: ChartsPerStoreRow,
  ctx: StoreMetricsContext,
  priorRevenue: number
): DashboardFilterStoreRow {
  const revenue = chart.revenueSum;
  const laborHours = chart.hoursSum;
  const overtimeHours = computeOvertimeHours(laborHours, ctx.periodDefaultLaborHours);

  return {
    storeId: chart.storeId,
    storeName: chart.storeName,
    revenue,
    laborHours,
    efficiencyRatio: chart.efficiencyRatio,
    revenueForecast: ctx.salesForecast > 0 ? ctx.salesForecast : null,
    revenueAchievement: revenue,
    revenueAchievementRate:
      ctx.salesForecast > 0 ? pctRate(revenue, ctx.salesForecast) : null,
    yoyGrowthRate: yoyRate(revenue, priorRevenue),
    priorYearRevenue: priorRevenue,
    actualAttendanceHours: laborHours,
    overtimeHours,
    overtimeRatio:
      overtimeHours != null ? pctRate(overtimeHours, laborHours) : null,
    dailyBusinessHours: ctx.labor.dailyBusinessHours,
    defaultLaborHours: ctx.periodDefaultLaborHours,
  };
}

function aggregateSummaryRows(rows: DashboardFilterStoreRow[]): DashboardFilterStoreRow {
  if (rows.length === 0) {
    return {
      storeId: "",
      storeName: "",
      revenue: 0,
      laborHours: 0,
      efficiencyRatio: null,
      revenueForecast: null,
      revenueAchievement: 0,
      revenueAchievementRate: null,
      yoyGrowthRate: null,
      priorYearRevenue: 0,
      actualAttendanceHours: 0,
      overtimeHours: null,
      overtimeRatio: null,
      dailyBusinessHours: null,
      defaultLaborHours: null,
    };
  }

  if (rows.length === 1) return rows[0];

  let revenue = 0;
  let laborHours = 0;
  let revenueForecast = 0;
  let priorYearRevenue = 0;
  let defaultLaborHours = 0;
  let hasDefaultLabor = false;
  let hasForecast = false;

  for (const r of rows) {
    revenue += r.revenue;
    laborHours += r.laborHours;
    priorYearRevenue += r.priorYearRevenue;
    if (r.revenueForecast != null && r.revenueForecast > 0) {
      revenueForecast += r.revenueForecast;
      hasForecast = true;
    }
    if (r.defaultLaborHours != null) {
      defaultLaborHours += r.defaultLaborHours;
      hasDefaultLabor = true;
    }
  }

  const overtimeHours = hasDefaultLabor ?
    computeOvertimeHours(laborHours, defaultLaborHours)
  : null;

  return {
    storeId: "",
    storeName: "",
    revenue,
    laborHours,
    efficiencyRatio: laborHours > 0 ? revenue / laborHours : null,
    revenueForecast: hasForecast ? revenueForecast : null,
    revenueAchievement: revenue,
    revenueAchievementRate: hasForecast ? pctRate(revenue, revenueForecast) : null,
    yoyGrowthRate: yoyRate(revenue, priorYearRevenue),
    priorYearRevenue,
    actualAttendanceHours: laborHours,
    overtimeHours,
    overtimeRatio:
      overtimeHours != null ? pctRate(overtimeHours, laborHours) : null,
    dailyBusinessHours: null,
    defaultLaborHours: hasDefaultLabor ? defaultLaborHours : null,
  };
}

function listDateStrings(startYmd: string, endYmd: string): string[] {
  const days: string[] = [];
  let dayStr = startYmd;
  while (dayStr <= endYmd) {
    days.push(dayStr);
    dayStr = addCalendarDaysUTC(dayStr, 1);
  }
  return days;
}

function formatTrendLabel(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${m}/${d}`;
}

async function mapDaysWithConcurrency<T>(
  dayStrs: string[],
  concurrency: number,
  fn: (dayStr: string) => Promise<T>
): Promise<T[]> {
  const results: T[] = new Array(dayStrs.length);
  let index = 0;
  async function worker() {
    while (index < dayStrs.length) {
      const i = index++;
      results[i] = await fn(dayStrs[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, dayStrs.length) }, () => worker())
  );
  return results;
}

export async function fetchDailyTrendForSelection(input: {
  startYmd: string;
  endYmd: string;
  selection: {
    storeId?: string;
    region?: string;
    storeLabel?: string;
    catalogKey?: string;
  };
  applyOpsCatalogWhenEmpty: boolean;
}): Promise<DashboardDailyTrendPoint[]> {
  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
  });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));

  const dayStrs = listDateStrings(input.startYmd, input.endYmd);
  const dailyTotals = await mapDaysWithConcurrency(dayStrs, 4, async (dayStr) => {
    const daily = await computeDailyMetricsByStoreResilient(
      parseDateOnlyUTC(dayStr),
      { reportVisibleOnly: true }
    );
    const chartRows: ChartsPerStoreRow[] = [];
    for (const [storeId, m] of daily) {
      if (!(m.revenue > 0 || m.laborHours > 0)) continue;
      chartRows.push({
        storeId,
        storeName: nameById.get(storeId) ?? "",
        revenueSum: m.revenue,
        hoursSum: m.laborHours,
        efficiencyRatio: m.laborHours > 0 ? m.revenue / m.laborHours : null,
      });
    }

    let filtered = filterChartsBySelection(chartRows, new Map(), input.selection);
    if (input.applyOpsCatalogWhenEmpty) {
      filtered = filterChartsByOpsCatalog(filtered);
    }
    const totals = metricsFromChartRows(filtered);
    return { dayStr, revenue: totals.revenue, laborHours: totals.laborHours };
  });

  return dailyTotals.map((d) => ({
    date: d.dayStr,
    label: formatTrendLabel(d.dayStr),
    revenue: d.revenue,
    laborHours: d.laborHours,
  }));
}

export async function buildDashboardFilterResult(input: {
  perStore: ChartsPerStoreRow[];
  priorPerStore: ChartsPerStoreRow[];
  startYmd: string;
  endYmd: string;
  filterLabel: string;
  storeCount: number;
  selection: {
    storeId?: string;
    region?: string;
    storeLabel?: string;
    catalogKey?: string;
  };
  applyOpsCatalogWhenEmpty: boolean;
}): Promise<DashboardFilterResult> {
  let filteredCharts = filterChartsBySelection(input.perStore, new Map(), input.selection);

  if (input.applyOpsCatalogWhenEmpty) {
    filteredCharts = filterChartsByOpsCatalog(filteredCharts);
  }

  let priorCharts = filterChartsBySelection(
    input.priorPerStore,
    new Map(),
    input.selection
  );
  if (input.applyOpsCatalogWhenEmpty) {
    priorCharts = filterChartsByOpsCatalog(priorCharts);
  }

  const priorByStoreId = new Map(priorCharts.map((r) => [r.storeId, r.revenueSum]));

  const storeIds = filteredCharts.map((r) => r.storeId);
  const [holidaySet, perfToRetail] = await Promise.all([
    loadHolidaySet(input.startYmd, input.endYmd),
    mapPerformanceToRetailStore(storeIds),
  ]);

  const workingDaysInRange = countWorkingDaysInRangeUTC(
    input.startYmd,
    input.endYmd,
    holidaySet
  );

  const slices = listMonthSlicesInRange(input.startYmd, input.endYmd);
  const retailIds = [...new Set([...perfToRetail.values()].map((v) => v.retailId))];
  const targetRows =
    retailIds.length > 0 && slices.length > 0 ?
      await prisma.storeTarget.findMany({
        where: {
          storeId: { in: retailIds },
          OR: slices.map(({ year, month }) => ({ year, month })),
        },
        select: {
          storeId: true,
          year: true,
          month: true,
          salesTarget: true,
        },
      })
    : [];

  const storeRows: DashboardFilterStoreRow[] = filteredCharts.map((chart) => {
    const linked = perfToRetail.get(chart.storeId);
    const labor = linked?.settings ?? {
      dailyBusinessHours: null,
      defaultLaborHoursPerDay: null,
    };
    const periodDefault = periodDefaultLaborHours(labor, workingDaysInRange);
    const salesForecast =
      linked ?
        prorateSalesForecastFromTargets(
          linked.retailId,
          slices,
          targetRows,
          holidaySet
        )
      : 0;

    return buildStoreRow(
      chart,
      { salesForecast, labor, periodDefaultLaborHours: periodDefault },
      priorByStoreId.get(chart.storeId) ?? 0
    );
  });

  const summary = aggregateSummaryRows(storeRows);
  const totals = metricsFromChartRows(filteredCharts);

  const dailyTrend = await fetchDailyTrendForSelection({
    startYmd: input.startYmd,
    endYmd: input.endYmd,
    selection: input.selection,
    applyOpsCatalogWhenEmpty: input.applyOpsCatalogWhenEmpty,
  });

  return {
    filterLabel: input.filterLabel,
    storeCount: input.storeCount,
    matchedStoreCount: filteredCharts.length,
    hasData: totals.revenue > 0 || totals.laborHours > 0,
    workingDaysInRange,
    summary,
    stores: storeRows,
    dailyTrend,
  };
}

export async function fetchPriorYearChartsForFilter(
  startYmd: string,
  endYmd: string,
  shiftYearFn: (ymd: string, delta: number) => string
): Promise<ChartsPerStoreRow[]> {
  return fetchChartsPerStore(shiftYearFn(startYmd, -1), shiftYearFn(endYmd, -1));
}

export function selectChartsRowsLikeChartsPage(
  perStore: ChartsPerStoreRow[],
  options: {
    storeId?: string;
    region?: string;
    catalogKey?: string;
    storeLabel?: string;
  }
): ChartsPerStoreRow[] {
  return filterChartsBySelection(perStore, new Map(), options);
}
