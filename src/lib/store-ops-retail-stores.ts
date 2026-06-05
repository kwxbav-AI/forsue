import { OPS_REGION_CATALOG, storeNameMatchesCatalogKey } from "@/lib/operations-dashboard";

/** 店務回報僅含桃園區 + 宜蘭區門市（不含台北區與其他部門） */
export const STORE_OPS_REGIONS = ["桃園區", "宜蘭區"] as const;
export type StoreOpsRegion = (typeof STORE_OPS_REGIONS)[number];

export const REGION_FILTER_PREFIX = "region:";

const CATALOG_GROUPS = OPS_REGION_CATALOG.filter((g) =>
  (STORE_OPS_REGIONS as readonly string[]).includes(g.region)
);

export function isStoreOpsRetailStore(storeName: string): boolean {
  for (const g of CATALOG_GROUPS) {
    for (const key of g.storeNames) {
      if (storeNameMatchesCatalogKey(storeName, key)) return true;
    }
  }
  return false;
}

export function filterStoreOpsRetailStores<
  T extends { storeName: string; region?: string | null },
>(stores: T[]): T[] {
  return stores.filter((s) => isStoreOpsRetailStore(s.storeName));
}

export function storeOpsRegionLabel(region: StoreOpsRegion): string {
  const names = CATALOG_GROUPS.find((g) => g.region === region)?.storeNames ?? [];
  const joined = names.join("");
  if (region === "桃園區") {
    return `桃園全區(包含：${joined})`;
  }
  return `宜蘭全區(包含：${joined})`;
}

export function groupStoreOpsRetailStoresByRegion<
  T extends { id: string; storeName: string; region?: string | null },
>(stores: T[]): { region: StoreOpsRegion; label: string; stores: T[] }[] {
  const ordered = orderedStoreOpsRetailStores(stores);
  const used = new Set<string>();
  return CATALOG_GROUPS.map((g) => {
    const regionStores = ordered.filter((s) => {
      if (used.has(s.id)) return false;
      const match = g.storeNames.some((k) => storeNameMatchesCatalogKey(s.storeName, k));
      if (match) used.add(s.id);
      return match;
    });
    return {
      region: g.region as StoreOpsRegion,
      label: storeOpsRegionLabel(g.region as StoreOpsRegion),
      stores: regionStores,
    };
  }).filter((g) => g.stores.length > 0);
}

export function orderedStoreOpsRetailStores<
  T extends { id: string; storeName: string; region?: string | null },
>(stores: T[]): T[] {
  const filtered = filterStoreOpsRetailStores(stores);
  const order: string[] = [];
  for (const g of CATALOG_GROUPS) {
    for (const key of g.storeNames) {
      order.push(key);
    }
  }
  return [...filtered].sort((a, b) => {
    const ia = order.findIndex((k) => storeNameMatchesCatalogKey(a.storeName, k));
    const ib = order.findIndex((k) => storeNameMatchesCatalogKey(b.storeName, k));
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

export type StoreFilterParsed =
  | { kind: "all" }
  | { kind: "region"; region: StoreOpsRegion }
  | { kind: "store"; storeId: string };

export function parseStoreFilterValue(value: string): StoreFilterParsed {
  if (!value || value === "all") return { kind: "all" };
  if (value.startsWith(REGION_FILTER_PREFIX)) {
    const region = value.slice(REGION_FILTER_PREFIX.length);
    if (region === "桃園區" || region === "宜蘭區") {
      return { kind: "region", region };
    }
  }
  return { kind: "store", storeId: value };
}

export function appendStoreFilterToParams(params: URLSearchParams, value: string) {
  const parsed = parseStoreFilterValue(value);
  if (parsed.kind === "region") params.set("region", parsed.region);
  else if (parsed.kind === "store") params.set("storeId", parsed.storeId);
}

/** 公佈欄發佈對象：region:桃園區 | region:宜蘭區 | storeId */
export function bulletinTargetFromFilter(value: string): {
  targetType: "REGION" | "STORE";
  targetRegion: string | null;
  targetStoreId: string | null;
} {
  const parsed = parseStoreFilterValue(value);
  if (parsed.kind === "region") {
    return { targetType: "REGION", targetRegion: parsed.region, targetStoreId: null };
  }
  if (parsed.kind === "store") {
    return {
      targetType: "STORE",
      targetRegion: null,
      targetStoreId: parsed.storeId,
    };
  }
  return { targetType: "REGION", targetRegion: "桃園區", targetStoreId: null };
}
