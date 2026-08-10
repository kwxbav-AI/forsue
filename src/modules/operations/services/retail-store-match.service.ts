import { prisma } from "@/lib/prisma";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
} from "@/lib/operations-dashboard";

const RETAIL_STORE_CACHE_MS = 5 * 60 * 1000;
let _retailStoreCache: { data: RetailStoreMatchRow[]; expiresAt: number } | null = null;

/** 取得所有啟用中的營運門市，5 分鐘快取避免重複查詢 */
export async function getActiveRetailStores(): Promise<RetailStoreMatchRow[]> {
  if (_retailStoreCache && _retailStoreCache.expiresAt > Date.now()) return _retailStoreCache.data;
  const data = await prisma.retailStore.findMany({
    where: { isActive: true },
    select: { id: true, storeName: true, region: true },
  });
  _retailStoreCache = { data, expiresAt: Date.now() + RETAIL_STORE_CACHE_MS };
  return data;
}

export type RetailStoreMatchRow = {
  id: string;
  storeName: string;
  region: string | null;
};

/** 將 Excel／績效門市名稱對應到既有營運門市（避免僅精確比對而重複建立） */
export function resolveRetailStore(
  storeKey: string,
  storeLabel: string,
  retailStores: RetailStoreMatchRow[]
): RetailStoreMatchRow | null {
  const exact = retailStores.find((r) => r.storeName.trim() === storeLabel.trim());
  if (exact) return exact;

  const byKey = retailStores.find((r) => normalizeStoreKey(r.storeName) === storeKey);
  if (byKey) return byKey;

  const fuzzy = retailStores.find(
    (r) =>
      storeNameMatchesCatalogKey(r.storeName, storeKey) ||
      storeNameMatchesCatalogKey(storeLabel, r.storeName) ||
      storeNamesEquivalent(r.storeName, storeLabel)
  );
  return fuzzy ?? null;
}
