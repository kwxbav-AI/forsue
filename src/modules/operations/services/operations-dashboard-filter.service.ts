import { prisma } from "@/lib/prisma";
import { resolveScheduledHours } from "@/lib/scheduled-hours";
import { addCalendarDaysUTC, parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { computeDailyMetricsByStoreResilient } from "@/modules/performance/services/daily-store-metrics.service";
import {
  countWorkingDaysInRangeUTC,
  monthStartEndYmd,
} from "@/lib/month-working-calendar";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
} from "@/lib/operations-dashboard";
import { formatRetailBusinessHoursDisplay } from "@/lib/retail-store-hours";
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
  /** 區間內各月營收目標合計（整月目標，不按比例攤提） */
  revenueForecast: number | null;
  monthlyLaborHourTarget: number | null;
  revenueAchievement: number;
  revenueAchievementRate: number | null;
  yoyGrowthRate: number | null;
  priorYearRevenue: number;
  actualAttendanceHours: number;
  /** 表訂工時：出勤紀錄 F 欄（scheduledWorkHours）加總 */
  scheduledHours: number | null;
  /** 加班工時：實際打卡超出表訂的部分（逐人逐日 max(0, actual-scheduled)）*/
  overtimeHours: number | null;
  overtimeRatio: number | null;
  /** 平日營業時長（週一～五） */
  weekdayBusinessHours: number | null;
  /** 週六營業時長 */
  saturdayBusinessHours: number | null;
  /** 舊欄位，等同平日 */
  dailyBusinessHours: number | null;
  /** 顯示用：平日 X / 週六 Y hr */
  businessHoursLabel: string;
  /** 篩選區間目標工時合計（門市目標月工時依工作天比例攤提） */
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
  weekdayBusinessHours: number | null;
  saturdayBusinessHours: number | null;
  dailyBusinessHours: number | null;
  defaultLaborHoursPerDay: number | null;
};

type StoreMetricsContext = {
  monthlySalesTarget: number;
  monthlyLaborHourTarget: number;
  labor: RetailLaborSettings;
  periodLaborHourTarget: number | null;
};

function sumFullMonthSalesTargetFromTargets(
  retailStoreId: string,
  slices: MonthSlice[],
  targets: Array<{
    storeId: string;
    year: number;
    month: number;
    salesTarget: unknown;
  }>
): number {
  const targetByYm = new Map(
    targets
      .filter((t) => t.storeId === retailStoreId)
      .map((t) => [`${t.year}-${t.month}`, t] as const)
  );
  let total = 0;
  for (const slice of slices) {
    const row = targetByYm.get(`${slice.year}-${slice.month}`);
    if (row) total += Number(row.salesTarget);
  }
  return total;
}

function sumFullMonthLaborHourTargetFromTargets(
  retailStoreId: string,
  slices: MonthSlice[],
  targets: Array<{
    storeId: string;
    year: number;
    month: number;
    laborHourTarget: unknown;
  }>
): number {
  const targetByYm = new Map(
    targets
      .filter((t) => t.storeId === retailStoreId)
      .map((t) => [`${t.year}-${t.month}`, t] as const)
  );
  let total = 0;
  for (const slice of slices) {
    const row = targetByYm.get(`${slice.year}-${slice.month}`);
    if (row) total += Number(row.laborHourTarget);
  }
  return total;
}

function pctRateOneDecimal(numerator: number, denominator: number): number | null {
  const r = pctRate(numerator, denominator);
  if (r == null) return null;
  return Math.round(r * 10) / 10;
}

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

type RawRetailRow = {
  id: string;
  store_name: string;
  legacy_store_id: string | null;
  weekday_business_hours: unknown;
  saturday_business_hours: unknown;
  daily_business_hours: unknown;
  default_labor_hours_per_day: unknown;
};

export async function mapPerformanceToRetailStore(
  performanceStoreIds: string[]
): Promise<Map<string, { retailId: string; settings: RetailLaborSettings }>> {
  if (performanceStoreIds.length === 0) return new Map();

  const perfStores = await prisma.store.findMany({
    where: { id: { in: performanceStoreIds } },
    select: { id: true, name: true },
  });

  // 用 raw SQL 取得 legacy_store_id（直接對應 performance Store id），
  // Prisma schema 未映射此欄位但 DB 已存在。
  const rawRetailStores = await prisma.$queryRaw<RawRetailRow[]>`
    SELECT id, store_name, legacy_store_id,
           weekday_business_hours, saturday_business_hours,
           daily_business_hours, default_labor_hours_per_day
    FROM stores
    WHERE is_active = true
  `;

  // 優先：legacy_store_id 直接對應 performance Store id
  const retailByLegacyId = new Map<string, RawRetailRow>();
  for (const r of rawRetailStores) {
    if (r.legacy_store_id) retailByLegacyId.set(r.legacy_store_id, r);
  }

  // 次要：exact name / normalized key 比對
  const retailByExactName = new Map<string, RawRetailRow>(
    rawRetailStores.map((r) => [r.store_name.trim(), r])
  );
  // 若同 normalize key 有多筆，優先保留名稱本身等於 key 的（不需去掉「店」的版本）
  const retailByNormKey = new Map<string, RawRetailRow>();
  for (const r of rawRetailStores) {
    const key = normalizeStoreKey(r.store_name);
    const existing = retailByNormKey.get(key);
    if (!existing || normalizeStoreKey(existing.store_name) !== existing.store_name.trim()) {
      retailByNormKey.set(key, r);
    }
  }

  function toSettings(r: RawRetailRow): RetailLaborSettings {
    const weekday =
      toOptionalNumber(r.weekday_business_hours) ??
      toOptionalNumber(r.daily_business_hours);
    return {
      weekdayBusinessHours: weekday,
      saturdayBusinessHours: toOptionalNumber(r.saturday_business_hours),
      dailyBusinessHours: weekday,
      defaultLaborHoursPerDay: toOptionalNumber(r.default_labor_hours_per_day),
    };
  }

  const out = new Map<string, { retailId: string; settings: RetailLaborSettings }>();
  for (const s of perfStores) {
    const perfKey = normalizeStoreKey(s.name);
    const raw =
      retailByLegacyId.get(s.id) ??
      retailByExactName.get(s.name.trim()) ??
      retailByNormKey.get(perfKey) ??
      rawRetailStores.find(
        (r) =>
          storeNameMatchesCatalogKey(r.store_name, perfKey) ||
          storeNameMatchesCatalogKey(s.name, r.store_name) ||
          storeNamesEquivalent(r.store_name, s.name)
      );
    if (!raw) continue;
    out.set(s.id, {
      retailId: raw.id,
      settings: toSettings(raw),
    });
  }
  return out;
}

function prorateLaborHourTargetFromTargets(
  retailStoreId: string,
  slices: MonthSlice[],
  targets: Array<{
    storeId: string;
    year: number;
    month: number;
    laborHourTarget: unknown;
  }>,
  holidaySet: Set<string>
): number {
  const targetByYm = new Map(
    targets
      .filter((t) => t.storeId === retailStoreId)
      .map((t) => [`${t.year}-${t.month}`, t] as const)
  );

  let laborHourTarget = 0;
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

    laborHourTarget += Number(row.laborHourTarget) * (overlapWd / monthWd);
  }
  return laborHourTarget;
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

function periodLaborHourTarget(
  retailStoreId: string | undefined,
  slices: MonthSlice[],
  targets: Array<{
    storeId: string;
    year: number;
    month: number;
    laborHourTarget: unknown;
  }>,
  holidaySet: Set<string>,
  settings: RetailLaborSettings,
  workingDaysInRange: number
): number | null {
  if (retailStoreId && slices.length > 0 && targets.length > 0) {
    const fromTargets = prorateLaborHourTargetFromTargets(
      retailStoreId,
      slices,
      targets,
      holidaySet
    );
    if (fromTargets > 0) return fromTargets;
  }
  if (
    settings.defaultLaborHoursPerDay != null &&
    workingDaysInRange > 0
  ) {
    return settings.defaultLaborHoursPerDay * workingDaysInRange;
  }
  return null;
}

function computeOvertimeHours(
  actualHours: number,
  periodDefault: number | null
): number | null {
  if (periodDefault == null) return null;
  return actualHours - periodDefault;
}

/** 從出勤紀錄計算各 HR 門市的表訂工時與加班工時 */
async function fetchScheduledAndOvertimeByStore(
  hrStoreIds: string[],
  startYmd: string,
  endYmd: string
): Promise<Map<string, { scheduledHours: number; overtimeHours: number }>> {
  if (hrStoreIds.length === 0) return new Map();
  const hrSet = new Set(hrStoreIds);
  const workDates = listDateStrings(startYmd, endYmd).map(parseDateOnlyUTC);
  const records = await prisma.attendanceRecord.findMany({
    where: {
      workDate: { in: workDates },
      workHours: { gt: 0 },
      OR: [
        { employee: { defaultStoreId: { in: hrStoreIds } } },
        { originalStoreId: { in: hrStoreIds } },
      ],
    },
    select: {
      workHours: true,
      scheduledWorkHours: true,
      shiftType: true,
      startTime: true,
      endTime: true,
      originalStoreId: true,
      employee: { select: { defaultStoreId: true } },
    },
  });
  const result = new Map<string, { scheduledHours: number; overtimeHours: number }>();
  for (const r of records) {
    const sid = r.employee.defaultStoreId ?? r.originalStoreId;
    if (!sid || !hrSet.has(sid)) continue;
    const wh = Number(r.workHours);
    const sh = resolveScheduledHours(r) ?? 0;
    const ot = sh > 0 ? Math.max(0, wh - sh) : 0;
    const cur = result.get(sid) ?? { scheduledHours: 0, overtimeHours: 0 };
    cur.scheduledHours += sh;
    cur.overtimeHours += ot;
    result.set(sid, cur);
  }
  return result;
}

function buildStoreRow(
  chart: ChartsPerStoreRow,
  ctx: StoreMetricsContext,
  priorRevenue: number
): DashboardFilterStoreRow {
  const revenue = chart.revenueSum;
  const laborHours = chart.hoursSum;
  const overtimeRaw = computeOvertimeHours(laborHours, ctx.periodLaborHourTarget);
  const overtimeHours =
    overtimeRaw != null ? Math.abs(overtimeRaw) : null;

  return {
    storeId: chart.storeId,
    storeName: chart.storeName,
    revenue,
    laborHours,
    efficiencyRatio: chart.efficiencyRatio,
    scheduledHours: null,
    revenueForecast:
      ctx.monthlySalesTarget > 0 ? ctx.monthlySalesTarget : null,
    monthlyLaborHourTarget:
      ctx.monthlyLaborHourTarget > 0 ? ctx.monthlyLaborHourTarget : null,
    revenueAchievement: revenue,
    revenueAchievementRate:
      ctx.monthlySalesTarget > 0 ?
        pctRateOneDecimal(revenue, ctx.monthlySalesTarget)
      : null,
    yoyGrowthRate: yoyRate(revenue, priorRevenue),
    priorYearRevenue: priorRevenue,
    actualAttendanceHours: laborHours,
    overtimeHours,
    overtimeRatio:
      overtimeHours != null && laborHours > 0 ?
        pctRateOneDecimal(overtimeHours, laborHours)
      : null,
    weekdayBusinessHours: ctx.labor.weekdayBusinessHours,
    saturdayBusinessHours: ctx.labor.saturdayBusinessHours,
    dailyBusinessHours: ctx.labor.dailyBusinessHours,
    businessHoursLabel: formatRetailBusinessHoursDisplay(ctx.labor),
    defaultLaborHours: ctx.periodLaborHourTarget,
  };
}

function aggregateSummaryRows(
  rows: DashboardFilterStoreRow[],
  priorTotalRevenue?: number
): DashboardFilterStoreRow {
  if (rows.length === 0) {
    return {
      storeId: "",
      storeName: "",
      revenue: 0,
      laborHours: 0,
      efficiencyRatio: null,
      revenueForecast: null,
      monthlyLaborHourTarget: null,
      revenueAchievement: 0,
      revenueAchievementRate: null,
      yoyGrowthRate: null,
      priorYearRevenue: 0,
      actualAttendanceHours: 0,
      scheduledHours: null,
      overtimeHours: null,
      overtimeRatio: null,
      weekdayBusinessHours: null,
      saturdayBusinessHours: null,
      dailyBusinessHours: null,
      businessHoursLabel: "—",
      defaultLaborHours: null,
    };
  }

  if (rows.length === 1) return rows[0];

  let revenue = 0;
  let laborHours = 0;
  let monthlySalesTarget = 0;
  let monthlyLaborHourTarget = 0;
  let periodLaborTarget = 0;
  let scheduledHoursTotal = 0;
  let overtimeHoursTotal = 0;
  let hasDefaultLabor = false;
  let hasSalesTarget = false;
  let hasMonthlyLabor = false;
  let hasAttendanceData = false;

  for (const r of rows) {
    revenue += r.revenue;
    laborHours += r.laborHours;
    if (r.revenueForecast != null && r.revenueForecast > 0) {
      monthlySalesTarget += r.revenueForecast;
      hasSalesTarget = true;
    }
    if (r.monthlyLaborHourTarget != null && r.monthlyLaborHourTarget > 0) {
      monthlyLaborHourTarget += r.monthlyLaborHourTarget;
      hasMonthlyLabor = true;
    }
    if (r.defaultLaborHours != null) {
      periodLaborTarget += r.defaultLaborHours;
      hasDefaultLabor = true;
    }
    if (r.scheduledHours != null) {
      scheduledHoursTotal += r.scheduledHours;
      hasAttendanceData = true;
    }
    if (r.overtimeHours != null) {
      overtimeHoursTotal += r.overtimeHours;
    }
  }

  const scheduledHours = hasAttendanceData ? Math.round(scheduledHoursTotal * 10) / 10 : null;
  const overtimeHours = hasAttendanceData
    ? Math.round(overtimeHoursTotal * 10) / 10
    : hasDefaultLabor
    ? (() => { const r = computeOvertimeHours(laborHours, periodLaborTarget); return r != null ? Math.abs(r) : null; })()
    : null;
  const priorYearRevenue =
    priorTotalRevenue ??
    rows.reduce((a, r) => a + r.priorYearRevenue, 0);

  return {
    storeId: "",
    storeName: "",
    revenue,
    laborHours,
    efficiencyRatio: laborHours > 0 ? revenue / laborHours : null,
    revenueForecast: hasSalesTarget ? monthlySalesTarget : null,
    monthlyLaborHourTarget: hasMonthlyLabor ? monthlyLaborHourTarget : null,
    revenueAchievement: revenue,
    revenueAchievementRate:
      hasSalesTarget ? pctRateOneDecimal(revenue, monthlySalesTarget) : null,
    yoyGrowthRate: yoyRate(revenue, priorYearRevenue),
    priorYearRevenue,
    actualAttendanceHours: laborHours,
    scheduledHours,
    overtimeHours,
    overtimeRatio:
      overtimeHours != null && scheduledHoursTotal > 0 ?
        pctRateOneDecimal(overtimeHours, scheduledHoursTotal)
      : overtimeHours != null && laborHours > 0 ?
        pctRateOneDecimal(overtimeHours, laborHours)
      : null,
    weekdayBusinessHours: null,
    saturdayBusinessHours: null,
    dailyBusinessHours: null,
    businessHoursLabel: "—",
    defaultLaborHours: hasDefaultLabor ? periodLaborTarget : null,
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
  /** 月趨勢等彙總場景可略過逐日趨勢以加速 */
  skipDailyTrend?: boolean;
  /** 總覽等同次請求已對應的績效→營運門市，避免重複查詢 */
  perfToRetailPreloaded?: Map<string, { retailId: string; settings: RetailLaborSettings }>;
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
    input.perfToRetailPreloaded ?
      Promise.resolve(input.perfToRetailPreloaded)
    : mapPerformanceToRetailStore(storeIds),
  ]);

  const workingDaysInRange = countWorkingDaysInRangeUTC(
    input.startYmd,
    input.endYmd,
    holidaySet
  );

  const slices = listMonthSlicesInRange(input.startYmd, input.endYmd);

  const activeRetail = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true },
  });
  const retailIdByStoreNameKey = new Map(
    activeRetail.map((r) => [normalizeStoreKey(r.storeName), r.id])
  );

  const retailIdsForTargets = new Set<string>(
    [...perfToRetail.values()].map((v) => v.retailId)
  );
  for (const chart of filteredCharts) {
    const rid =
      perfToRetail.get(chart.storeId)?.retailId ??
      retailIdByStoreNameKey.get(normalizeStoreKey(chart.storeName));
    if (rid) retailIdsForTargets.add(rid);
  }

  const targetRows =
    retailIdsForTargets.size > 0 && slices.length > 0 ?
      await prisma.storeTarget.findMany({
        where: {
          storeId: { in: [...retailIdsForTargets] },
          OR: slices.map(({ year, month }) => ({ year, month })),
        },
        select: {
          storeId: true,
          year: true,
          month: true,
          salesTarget: true,
          laborHourTarget: true,
        },
      })
    : [];

  const storeRows: DashboardFilterStoreRow[] = filteredCharts.map((chart) => {
    const linked = perfToRetail.get(chart.storeId);
    const retailId =
      linked?.retailId ??
      retailIdByStoreNameKey.get(normalizeStoreKey(chart.storeName));
    const labor = linked?.settings ?? {
      weekdayBusinessHours: null,
      saturdayBusinessHours: null,
      dailyBusinessHours: null,
      defaultLaborHoursPerDay: null,
    };
    const periodDefault = periodLaborHourTarget(
      retailId,
      slices,
      targetRows,
      holidaySet,
      labor,
      workingDaysInRange
    );
    const monthlySalesTarget =
      retailId ?
        sumFullMonthSalesTargetFromTargets(retailId, slices, targetRows)
      : 0;
    const monthlyLaborHourTarget =
      retailId ?
        sumFullMonthLaborHourTargetFromTargets(retailId, slices, targetRows)
      : 0;

    return buildStoreRow(
      chart,
      {
        monthlySalesTarget,
        monthlyLaborHourTarget,
        labor,
        periodLaborHourTarget: periodDefault,
      },
      priorByStoreId.get(chart.storeId) ?? 0
    );
  });

  // 從出勤紀錄計算表訂工時與加班工時（覆寫 buildStoreRow 中舊的估算值）
  const hrStoreIds = filteredCharts.map((c) => c.storeId);
  const attendanceByStore = await fetchScheduledAndOvertimeByStore(
    hrStoreIds,
    input.startYmd,
    input.endYmd
  );
  for (const row of storeRows) {
    const att = attendanceByStore.get(row.storeId);
    if (att) {
      row.scheduledHours = Math.round(att.scheduledHours * 10) / 10;
      row.overtimeHours = Math.round(att.overtimeHours * 10) / 10;
      row.overtimeRatio =
        att.scheduledHours > 0 ?
          pctRateOneDecimal(att.overtimeHours, att.scheduledHours)
        : null;
    }
  }

  const priorYearRevenueTotal = priorCharts.reduce((a, r) => a + r.revenueSum, 0);
  const summary = aggregateSummaryRows(storeRows, priorYearRevenueTotal);
  const totals = metricsFromChartRows(filteredCharts);

  const dailyTrend =
    input.skipDailyTrend ?
      []
    : await fetchDailyTrendForSelection({
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
