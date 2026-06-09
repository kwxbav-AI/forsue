import { prisma } from "@/lib/prisma";
import { toDateRange, toDateRangeTaipei } from "@/lib/date";
import {
  DUAL_OPS_REGIONS,
  OPS_REGION_CATALOG,
  inferRetailRegion,
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
  formatOpsStoreLabel,
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

const chartsPerStoreCache = new Map<string, {
  expiresAt: number;
  data: ChartsPerStoreRow[];
}>();
const CHARTS_CACHE_MS = 3 * 60 * 1000; // 3 分鐘

export async function fetchChartsPerStore(
  startDate: string,
  endDate: string
): Promise<ChartsPerStoreRow[]> {
  const key = `${startDate}|${endDate}`;
  const now = Date.now();
  const cached = chartsPerStoreCache.get(key);
  if (cached && cached.expiresAt > now) return cached.data;

  const rows = await aggregateStoreMetricsForRange(startDate, endDate);
  const data = rows.map(toChartsRow);
  chartsPerStoreCache.set(key, { expiresAt: now + CHARTS_CACHE_MS, data });
  return data;
}

/** YoY 去年同期（PerformanceDaily 快照；去年通常無即時上傳） */
export async function fetchDualRegionTotalsFromPerformanceDaily(
  startDate: string,
  endDate: string
): Promise<PerformanceAggregate> {
  const { start, end } = toDateRangeTaipei(startDate, endDate);

  const allowedKeys = getCatalogKeysForRegions(DUAL_OPS_REGIONS);
  const catalogStores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
  });

  const dualIds = catalogStores
    .filter((s) => {
      const key = normalizeStoreKey(s.name);
      if (allowedKeys.has(key)) return true;
      for (const catalogKey of allowedKeys) {
        if (storeNameMatchesCatalogKey(s.name, catalogKey)) return true;
      }
      return false;
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

/** 依營運 catalog 區域名稱篩選（與圖表門市名稱一致，不依 department 推斷） */
export function getCatalogKeysForRegions(regions: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const { region, storeNames } of OPS_REGION_CATALOG) {
    if (!regions.includes(region)) continue;
    for (const name of storeNames) {
      keys.add(normalizeStoreKey(name));
    }
  }
  return keys;
}

export function rowMatchesCatalogRegions(
  row: Pick<ChartsPerStoreRow, "storeName">,
  regions: readonly string[]
): boolean {
  const allowed = getCatalogKeysForRegions(regions);
  const key = normalizeStoreKey(row.storeName);
  if (allowed.has(key)) return true;
  for (const catalogKey of allowed) {
    if (storeNameMatchesCatalogKey(row.storeName, catalogKey)) return true;
  }
  return false;
}

export function filterChartsByCatalogRegions(
  rows: ChartsPerStoreRow[],
  regions: readonly string[]
): ChartsPerStoreRow[] {
  return rows.filter((r) => rowMatchesCatalogRegions(r, regions));
}

/** @deprecated 請改用 filterChartsByCatalogRegions */
export function filterChartsByDualRegions(
  rows: ChartsPerStoreRow[],
  regionMap: Map<string, string>
): ChartsPerStoreRow[] {
  return filterChartsByCatalogRegions(rows, DUAL_OPS_REGIONS);
}

/** 桃園＋宜蘭區間加總（與圖表相同公式：上傳營收／真實工時） */
export async function fetchDualRegionChartTotals(
  startDate: string,
  endDate: string
): Promise<PerformanceAggregate> {
  const perStore = await fetchChartsPerStore(startDate, endDate);
  const rows = filterChartsByCatalogRegions(perStore, DUAL_OPS_REGIONS);
  return sumChartRows(rows);
}

/** 桃園＋宜蘭 catalog 門市 ID（含已停用，不含 hideInReports） */
export async function listDualRegionStoreIdsForRevenue(): Promise<string[]> {
  const allowedKeys = getCatalogKeysForRegions(DUAL_OPS_REGIONS);
  const stores = await prisma.store.findMany({
    where: { hideInReports: false },
    select: { id: true, name: true },
  });
  return stores
    .filter((s) => {
      const key = normalizeStoreKey(s.name);
      if (allowedKeys.has(key)) return true;
      for (const catalogKey of allowedKeys) {
        if (storeNameMatchesCatalogKey(s.name, catalogKey)) return true;
      }
      return false;
    })
    .map((s) => s.id);
}

/**
 * 桃園＋宜蘭區間營收加總（直接查 revenueRecord、UTC 日曆區間）。
 * 供 YoY 成長率使用，避免圖表加總漏計已停用門市或僅去年同期有營收之門市。
 */
export async function fetchDualRegionRevenueTotal(
  startDate: string,
  endDate: string
): Promise<number> {
  const storeIds = await listDualRegionStoreIdsForRevenue();
  if (storeIds.length === 0) return 0;

  const { start, end } = toDateRange(startDate, endDate);
  const grouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: {
      storeId: { in: storeIds },
      revenueDate: { gte: start, lte: end },
    },
    _sum: { revenueAmount: true },
  });

  let revenue = 0;
  for (const g of grouped) {
    revenue += Number(g._sum.revenueAmount ?? 0);
  }
  return revenue;
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

/**
 * 女中與女中店視為同一門市：多列時只取「主檔」一列（優先名稱=女中，其次女中店），不將兩列加總。
 */
export function pickPrimaryChartsRowForCatalog(
  rows: ChartsPerStoreRow[],
  catalogKey: string
): ChartsPerStoreRow | null {
  if (rows.length === 0) return null;
  const key = normalizeStoreKey(catalogKey);
  return [...rows].sort((a, b) => {
    const rankDiff =
      catalogStoreNameRank(a.storeName, key) -
      catalogStoreNameRank(b.storeName, key);
    if (rankDiff !== 0) return rankDiff;
    return b.revenueSum - a.revenueSum;
  })[0];
}

export function collapseChartsRowsByCatalog(
  rows: ChartsPerStoreRow[],
  catalogKey: string
): ChartsPerStoreRow[] {
  const primary = pickPrimaryChartsRowForCatalog(rows, catalogKey);
  return primary ? [primary] : [];
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
      if (byCatalog.length > 0) {
        return collapseChartsRowsByCatalog(byCatalog, catalog);
      }
    }

    if (options.storeId) {
      const byId = rows.filter((r) => r.storeId === options.storeId);
      if (byId.length > 0) return byId;
    }

    if (options.storeLabel) {
      const labelKey = normalizeStoreKey(options.storeLabel);
      const fromLabel = rows.filter((r) =>
        storeNamesEquivalent(r.storeName, options.storeLabel!)
      );
      if (fromLabel.length > 0) {
        return collapseChartsRowsByCatalog(fromLabel, catalog || labelKey);
      }
    }

    return [];
  }
  if (options.region) {
    return filterChartsByCatalogRegions(rows, [options.region]);
  }
  return rows;
}

export function filterChartsByOpsCatalog(rows: ChartsPerStoreRow[]): ChartsPerStoreRow[] {
  const catalogKeys = OPS_REGION_CATALOG.flatMap((g) => g.storeNames).map(
    normalizeStoreKey
  );
  return rows.filter((r) => {
    const key = normalizeStoreKey(r.storeName);
    if (catalogKeys.includes(key)) return true;
    return catalogKeys.some((ck) => storeNameMatchesCatalogKey(r.storeName, ck));
  });
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
    let matchedKey: string | null = null;
    const normalized = normalizeStoreKey(s.name);
    if (catalogKeys.has(normalized)) {
      matchedKey = normalized;
    } else {
      for (const catalogKey of catalogKeys) {
        if (storeNameMatchesCatalogKey(s.name, catalogKey)) {
          matchedKey = catalogKey;
          break;
        }
      }
    }
    if (!matchedKey) continue;
    const list = candidatesByKey.get(matchedKey) ?? [];
    list.push(s);
    candidatesByKey.set(matchedKey, list);
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
