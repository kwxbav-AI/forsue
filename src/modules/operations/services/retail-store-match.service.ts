import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
  storeNamesEquivalent,
} from "@/lib/operations-dashboard";

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
