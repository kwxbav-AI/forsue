import { prisma } from "@/lib/prisma";
import {
  parseDateOnlyUTC,
  addCalendarDaysUTC,
  formatDateOnly,
  toDateRangeTaipei,
} from "@/lib/date";
import { getAttendanceDataStartDate } from "@/lib/attendance-data";
import {
  clampMetricsDateRange,
  getRevenueMetricsDataStartYmd,
} from "@/lib/performance-metrics-range";
import {
  buildRangeDailyMetricsPrefetch,
  computeDailyMetricsByStoreResilientWithPrefetch,
} from "./range-daily-metrics-prefetch.service";

export type PerformanceDailyRangeRow = {
  storeId: string;
  storeName: string;
  revenueSum: number;
  hoursSum: number;
  efficiencyRatio: number | null;
  dayCount: number;
};

const DAY_COMPUTE_CONCURRENCY = 16;

function hasActivity(row: Pick<PerformanceDailyRangeRow, "revenueSum" | "hoursSum">): boolean {
  return row.revenueSum > 0 || row.hoursSum > 0;
}

function listDateStrings(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let dayStr = startDate;
  while (dayStr <= endDate) {
    days.push(dayStr);
    dayStr = addCalendarDaysUTC(dayStr, 1);
  }
  return days;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/** 出勤上傳起日之前的區間：單次 groupBy 加總營收（避免逐日迴圈） */
async function addBulkRevenueBeforeAttendanceStart(
  accum: Map<
    string,
    {
      storeId: string;
      storeName: string;
      revenueSum: number;
      hoursSum: number;
      dayCount: number;
    }
  >,
  effStart: string,
  revenueOnlyEnd: string,
  attendanceStartYmd: string
): Promise<void> {
  if (effStart > revenueOnlyEnd || effStart >= attendanceStartYmd) return;

  const { start, end } = toDateRangeTaipei(effStart, revenueOnlyEnd);
  const grouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: { revenueDate: { gte: start, lte: end } },
    _sum: { revenueAmount: true },
  });

  for (const g of grouped) {
    const rev = Number(g._sum.revenueAmount ?? 0);
    if (rev <= 0) continue;
    let row = accum.get(g.storeId);
    if (!row) {
      row = {
        storeId: g.storeId,
        storeName: "",
        revenueSum: 0,
        hoursSum: 0,
        dayCount: 0,
      };
      accum.set(g.storeId, row);
    }
    row.revenueSum += rev;
    row.dayCount += 1;
  }
}

/** 依上傳營收／出勤即時加總（與重算公式相同） */
async function computeEngineRangeRows(
  effStart: string,
  effEnd: string
): Promise<PerformanceDailyRangeRow[]> {
  if (effStart > effEnd) return [];

  const attendanceStartYmd = formatDateOnly(await getAttendanceDataStartDate());

  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
  });

  type AccumRow = {
    storeId: string;
    storeName: string;
    revenueSum: number;
    hoursSum: number;
    dayCount: number;
  };

  const accum = new Map<string, AccumRow>(
    stores.map((s) => [
      s.id,
      {
        storeId: s.id,
        storeName: s.name,
        revenueSum: 0,
        hoursSum: 0,
        dayCount: 0,
      },
    ])
  );

  const revenueOnlyEnd =
    effEnd < attendanceStartYmd ?
      effEnd
    : addCalendarDaysUTC(attendanceStartYmd, -1);
  await addBulkRevenueBeforeAttendanceStart(
    accum,
    effStart,
    revenueOnlyEnd,
    attendanceStartYmd
  );

  const dayLoopStart =
    effStart >= attendanceStartYmd ? effStart : attendanceStartYmd;
  const dayStrs =
    dayLoopStart <= effEnd ? listDateStrings(dayLoopStart, effEnd) : [];

  let dailyMaps: Map<string, { revenue: number; laborHours: number }>[];
  if (dayStrs.length > 0) {
    const prefetch = await buildRangeDailyMetricsPrefetch(dayLoopStart, effEnd, {
      reportVisibleOnly: true,
    });
    dailyMaps = await mapWithConcurrency(dayStrs, DAY_COMPUTE_CONCURRENCY, (dayStr) =>
      computeDailyMetricsByStoreResilientWithPrefetch(parseDateOnlyUTC(dayStr), prefetch, {
        reportVisibleOnly: true,
      })
    );
  } else {
    dailyMaps = [];
  }

  for (const daily of dailyMaps) {
    for (const [storeId, m] of daily) {
      if (!(m.revenue > 0 || m.laborHours > 0)) continue;

      let row = accum.get(storeId);
      if (!row) {
        row = {
          storeId,
          storeName: "",
          revenueSum: 0,
          hoursSum: 0,
          dayCount: 0,
        };
        accum.set(storeId, row);
      }
      row.dayCount += 1;
      row.revenueSum += m.revenue;
      row.hoursSum += m.laborHours;
    }
  }

  const unresolvedIds = [...accum.entries()]
    .filter(([, row]) => !row.storeName)
    .map(([id]) => id);
  if (unresolvedIds.length > 0) {
    const resolved = await prisma.store.findMany({
      where: { id: { in: unresolvedIds } },
      select: { id: true, name: true, isActive: true, hideInReports: true },
    });
    const resolvedById = new Map(resolved.map((s) => [s.id, s]));
    for (const id of unresolvedIds) {
      const row = accum.get(id);
      const store = resolvedById.get(id);
      if (!row) continue;
      if (!store || !store.isActive || store.hideInReports) {
        accum.delete(id);
        continue;
      }
      row.storeName = store.name;
    }
  }

  return [...accum.values()]
    .map((s) => ({
      storeId: s.storeId,
      storeName: s.storeName,
      revenueSum: s.revenueSum,
      hoursSum: s.hoursSum,
      efficiencyRatio: s.hoursSum > 0 ? s.revenueSum / s.hoursSum : null,
      dayCount: s.dayCount,
    }))
    .filter((s) => s.storeName && hasActivity(s));
}

/**
 * 圖表／Dashboard／每日工效比區間共用。
 * 僅依上傳營收／出勤即時加總（真實工時），不使用 PerformanceDaily 8 小時快照。
 */
export async function aggregateStoreMetricsForRange(
  startDate: string,
  endDate: string
): Promise<PerformanceDailyRangeRow[]> {
  const revenueStartYmd = getRevenueMetricsDataStartYmd();
  const { startDate: effStart, endDate: effEnd } = clampMetricsDateRange(
    startDate,
    endDate,
    revenueStartYmd
  );

  return computeEngineRangeRows(effStart, effEnd);
}

/** @deprecated 請改用 aggregateStoreMetricsForRange */
export async function aggregatePerformanceDailyByStore(
  startDate: string,
  endDate: string
): Promise<PerformanceDailyRangeRow[]> {
  return aggregateStoreMetricsForRange(startDate, endDate);
}

export function sumPerformanceDailyRangeRows(
  rows: PerformanceDailyRangeRow[]
): {
  revenue: number;
  laborHours: number;
  efficiencyRatio: number | null;
} {
  let revenue = 0;
  let laborHours = 0;
  for (const r of rows) {
    revenue += r.revenueSum;
    laborHours += r.hoursSum;
  }
  return {
    revenue,
    laborHours,
    efficiencyRatio: laborHours > 0 ? revenue / laborHours : null,
  };
}

export async function resolveEffectiveMetricsDateRange(
  startDate: string,
  endDate: string
): Promise<{
  startDate: string;
  endDate: string;
  dataStartYmd: string;
  clamped: boolean;
}> {
  const dataStartYmd = getRevenueMetricsDataStartYmd();
  const clamped = clampMetricsDateRange(startDate, endDate, dataStartYmd);
  return { ...clamped, dataStartYmd };
}
