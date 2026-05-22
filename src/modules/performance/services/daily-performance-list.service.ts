import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import {
  addCalendarDaysUTC,
  formatDateOnly,
  parseDateOnlyUTC,
  toStartOfDay,
} from "@/lib/date";
import {
  inferRetailRegion,
  normalizeStoreKey,
  OPS_REGION_CATALOG,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";
import { getTargetForDate } from "@/modules/performance/services/target-setting.service";
import { computeDailyMetricsByStore } from "@/modules/performance/services/daily-store-metrics.service";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

const DAY_CONCURRENCY = 8;

function listDateStrings(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = addCalendarDaysUTC(d, 1);
  }
  return out;
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export type DailyPerformanceListRow = {
  id: string;
  workDate: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  region: string;
  revenueAmount: number;
  totalWorkHours: number;
  efficiencyRatio: number;
  targetValue: number;
  isTargetMet: boolean;
  calculatedAt: string;
};

function filterStoresByRegionAndId(
  stores: { id: string; name: string; code: string | null; department: string | null }[],
  region?: string,
  storeId?: string
) {
  let scoped = stores;
  if (region) {
    const group = OPS_REGION_CATALOG.find((g) => g.region === region);
    if (group) {
      const keys = new Set(group.storeNames.map(normalizeStoreKey));
      scoped = scoped.filter((s) => {
        const n = normalizeStoreKey(s.name);
        if (keys.has(n)) return true;
        return group.storeNames.some((ck) => storeNameMatchesCatalogKey(s.name, ck));
      });
    }
  }
  if (storeId) {
    scoped = scoped.filter((s) => s.id === storeId);
  }
  return scoped;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function listDailyPerformanceRows(input: {
  startYmd: string;
  endYmd: string;
  region?: string;
  storeId?: string;
}): Promise<{
  startDate: string;
  endDate: string;
  rows: DailyPerformanceListRow[];
}> {
  const effective = await resolveEffectiveMetricsDateRange(
    input.startYmd,
    input.endYmd
  );
  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    orderBy: { name: "asc" },
  });
  const filteredStores = filterStoresByRegionAndId(
    stores,
    input.region,
    input.storeId
  );
  const dayStrs = listDateStrings(effective.startDate, effective.endDate);
  const dailyMaps = await mapWithConcurrency(dayStrs, DAY_CONCURRENCY, async (ymd) => {
    const workDate = toStartOfDay(ymd);
    const [targetValue, metrics] = await Promise.all([
      getTargetForDate(workDate),
      computeDailyMetricsByStore(workDate, { reportVisibleOnly: true }),
    ]);
    return { ymd, workDate, targetValue, metrics, weekDay: workDate.getUTCDay() };
  });

  const rows: DailyPerformanceListRow[] = [];
  const now = new Date().toISOString();

  for (const day of dailyMaps) {
    for (const store of filteredStores) {
      const live = day.metrics.get(store.id);
      const revenueAmount = live?.revenue ?? 0;
      const totalWorkHours = round2(live?.laborHours ?? 0);
      if (revenueAmount <= 0 && totalWorkHours <= 0) continue;

      let efficiencyRatio = 0;
      if (totalWorkHours > 0) {
        efficiencyRatio = new Decimal(revenueAmount).div(totalWorkHours).toNumber();
      }
      const isTargetMet =
        totalWorkHours > 0 ?
          day.weekDay === 6 ?
            efficiencyRatio >= 5500
          : efficiencyRatio >= 4000
        : false;

      rows.push({
        id: `${day.ymd}-${store.id}`,
        workDate: day.ymd,
        storeId: store.id,
        storeName: store.name,
        storeCode: store.code,
        region: inferRetailRegion(store.name, store.department) ?? "",
        revenueAmount,
        totalWorkHours,
        efficiencyRatio,
        targetValue: day.targetValue,
        isTargetMet,
        calculatedAt: now,
      });
    }
  }

  rows.sort(
    (a, b) =>
      a.workDate.localeCompare(b.workDate) ||
      a.storeName.localeCompare(b.storeName, "zh-Hant")
  );

  return {
    startDate: effective.startDate,
    endDate: effective.endDate,
    rows,
  };
}

/** 單日（與舊 API 相容） */
export async function listSingleDayPerformanceRows(
  dateYmd: string,
  region?: string,
  storeId?: string
): Promise<DailyPerformanceListRow[]> {
  const { rows } = await listDailyPerformanceRows({
    startYmd: dateYmd,
    endYmd: dateYmd,
    region,
    storeId,
  });
  return rows;
}
