import { prisma } from "@/lib/prisma";
import { toDateRangeTaipei } from "@/lib/date";
import {
  DUAL_OPS_REGIONS,
  OPS_REGION_CATALOG,
  formatOpsStoreLabel,
  inferRetailRegion,
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";
import {
  aggregateStoreMetricsForRange,
  sumPerformanceDailyRangeRows,
} from "@/modules/performance/services/performance-daily-range.service";

export type PerformanceAggregate = {
  revenue: number;
  laborHours: number;
  efficiencyRatio: number | null;
};

/** 與 /api/reports/charts、每日工效比區間加總相同 */
export type ChartsPerStoreRow = {
  storeId: string;
  storeName: string;
  revenueSum: number;
  hoursSum: number;
  efficiencyRatio: number | null;
};

function toChartsRow(row: {
  storeId: string;
  storeName: string;
  revenueSum: number;
  hoursSum: number;
  efficiencyRatio: number | null;
}): ChartsPerStoreRow {
  return {
    storeId: row.storeId,
    storeName: row.storeName,
    revenueSum: row.revenueSum,
    hoursSum: row.hoursSum,
    efficiencyRatio: row.efficiencyRatio,
  };
}

/**
 * 與績效重算／每日工效比相同公式之區間加總（2026-04-01 起算）。
 * 圖表與營運 Dashboard 共用。
 */
export async function fetchChartsPerStore(
  startDate: string,
  endDate: string
): Promise<ChartsPerStoreRow[]> {
  const rows = await aggregateStoreMetricsForRange(startDate, endDate);
  return rows.map(toChartsRow);
}

/** YoY 去年同期（PerformanceDaily 快照；去年通常無即時上傳） */
export async function fetchDualRegionTotalsFromPerformanceDaily(
  startDate: string,
  endDate: string
): Promise<PerformanceAggregate> {
  const { start, end } = toDateRangeTaipei(startDate, endDate);

  const catalogStores = await prisma.store.findMany({
    where: {
      isActive: true,
      hideInReports: false,
      name: { in: OPS_REGION_CATALOG.flatMap((g) => [...g.storeNames]) },
    },
    select: { id: true, name: true, department: true },
  });

  const dualIds = catalogStores
    .filter((s) => {
      const r = inferRetailRegion(s.name, s.department);
      return r === "桃園區" || r === "宜蘭區";
    })
    .map((s) => s.id);

  if (dualIds.length === 0) {
    return { revenue: 0, laborHours: 0, efficiencyRatio: null };
  }

  const grouped = await prisma.performanceDaily.groupBy({
    by: ["storeId"],
    where: {
      workDate: { gte: start, lte: end },
      versionNo: 1,
      storeId: { in: dualIds },
    },
    _sum: { revenueAmount: true, totalWorkHours: true },
  });

  let revenue = 0;
  let laborHours = 0;
  for (const g of grouped) {
    revenue += Number(g._sum.revenueAmount ?? 0);
    laborHours += Number(g._sum.totalWorkHours ?? 0);
  }

  return {
    revenue,
    laborHours,
    efficiencyRatio: laborHours > 0 ? revenue / laborHours : null,
  };
}

export function sumChartRows(rows: ChartsPerStoreRow[]): PerformanceAggregate {
  return sumPerformanceDailyRangeRows(
    rows.map((r) => ({
      storeId: r.storeId,
      storeName: r.storeName,
      revenueSum: r.revenueSum,
      hoursSum: r.hoursSum,
      efficiencyRatio: r.efficiencyRatio,
      dayCount: 0,
    }))
  );
}

export function metricsFromChartRows(
  rows: ChartsPerStoreRow[]
): PerformanceAggregate {
  if (rows.length === 0) {
    return { revenue: 0, laborHours: 0, efficiencyRatio: null };
  }
  if (rows.length === 1) {
    const r = rows[0];
    return {
      revenue: r.revenueSum,
      laborHours: r.hoursSum,
      efficiencyRatio: r.efficiencyRatio,
    };
  }
  return sumChartRows(rows);
}

export async function buildStoreRegionMap(
  storeIds: string[]
): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();

  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, department: true },
  });

  return new Map(
    stores.map((s) => [s.id, inferRetailRegion(s.name, s.department) ?? ""])
  );
}

export function filterChartsByDualRegions(
  rows: ChartsPerStoreRow[],
  regionMap: Map<string, string>
): ChartsPerStoreRow[] {
  const dualSet = new Set<string>(DUAL_OPS_REGIONS);
  return rows.filter((r) => dualSet.has(regionMap.get(r.storeId) ?? ""));
}

function catalogStoreNameRank(name: string, catalogKey: string): number {
  const n = name.trim();
  if (n === catalogKey) return 0;
  if (n === `${catalogKey}店`) return 1;
  return 2;
}

/** 同一 catalog 若 DB 有多筆門市，優先「女中」再「女中店」等，避免篩選 id 與營收歸屬不一致 */
export function pickCatalogStore<
  T extends { id: string; name: string },
>(candidates: T[], catalogName: string): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const key = normalizeStoreKey(catalogName);
  return [...candidates].sort(
    (a, b) => catalogStoreNameRank(a.name, key) - catalogStoreNameRank(b.name, key)
  )[0];
}

/** 依 catalog 簡稱合併圖表列（含 DB 多筆同名門市、名稱含區域前綴） */
export function filterChartsByCatalogKey(
  rows: ChartsPerStoreRow[],
  catalogKey: string
): ChartsPerStoreRow[] {
  const key = normalizeStoreKey(catalogKey);
  if (!key) return [];
  return rows.filter((r) => storeNameMatchesCatalogKey(r.storeName, key));
}

export function filterChartsBySelection(
  rows: ChartsPerStoreRow[],
  regionMap: Map<string, string>,
  options: {
    storeId?: string;
    region?: string;
    storeLabel?: string;
    catalogKey?: string;
  }
): ChartsPerStoreRow[] {
  if (options.storeId || options.catalogKey) {
    const catalog =
      options.catalogKey ??
      (options.storeLabel ? normalizeStoreKey(options.storeLabel) : "");
    if (catalog) {
      const byCatalog = filterChartsByCatalogKey(rows, catalog);
      if (byCatalog.length > 0) return byCatalog;
    }

    if (options.storeId) {
      const byId = rows.filter((r) => r.storeId === options.storeId);
      if (byId.length > 0) return byId;
    }
    return [];
  }
  if (options.region) {
    return rows.filter((r) => regionMap.get(r.storeId) === options.region);
  }
  return rows;
}

export function filterChartsByOpsCatalog(rows: ChartsPerStoreRow[]): ChartsPerStoreRow[] {
  const catalogKeys = new Set(
    OPS_REGION_CATALOG.flatMap((g) => g.storeNames).map(normalizeStoreKey)
  );
  return rows.filter((r) => catalogKeys.has(normalizeStoreKey(r.storeName)));
}

export async function listPerformanceStoresForFilter() {
  const catalogKeys = new Set(
    OPS_REGION_CATALOG.flatMap((g) => g.storeNames).map(normalizeStoreKey)
  );
  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true, department: true },
  });

  const candidatesByKey = new Map<string, typeof stores>();
  for (const s of stores) {
    const key = normalizeStoreKey(s.name);
    if (!catalogKeys.has(key)) continue;
    const list = candidatesByKey.get(key) ?? [];
    list.push(s);
    candidatesByKey.set(key, list);
  }

  const result: Array<{
    id: string;
    storeName: string;
    region: string;
    catalogKey: string;
  }> = [];

  for (const { region, storeNames } of OPS_REGION_CATALOG) {
    for (const catalogName of storeNames) {
      const key = normalizeStoreKey(catalogName);
      const store = pickCatalogStore(candidatesByKey.get(key) ?? [], catalogName);
      if (!store) continue;
      result.push({
        id: store.id,
        storeName: formatOpsStoreLabel(store.name),
        region,
        catalogKey: catalogName,
      });
    }
  }

  return result;
}

export function getOpsCatalogStoreCount(region?: string): number {
  if (!region) {
    return OPS_REGION_CATALOG.reduce((n, g) => n + g.storeNames.length, 0);
  }
  const group = OPS_REGION_CATALOG.find((g) => g.region === region);
  return group?.storeNames.length ?? 0;
}
