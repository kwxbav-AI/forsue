import { prisma } from "@/lib/prisma";
import { formatOpsStoreLabel } from "@/lib/operations-dashboard";
import {
  getOpsCatalogStoreCount,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { resolveRetailStore } from "@/modules/operations/services/retail-store-match.service";

export type RetailStoreSyncResult = {
  /** 營運 catalog 門市槽位總數 */
  catalogSlots: number;
  /** 本次有對到績效主檔的槽位數 */
  matchedPerformance: number;
  created: number;
  updated: number;
  /** catalog 槽位在績效系統尚無門市主檔 */
  skippedNoPerformance: number;
};

function findExistingRetail(
  catalogKey: string,
  labels: string[],
  retailStores: { id: string; storeName: string; region: string | null }[]
) {
  for (const label of labels) {
    const hit = resolveRetailStore(catalogKey, label, retailStores);
    if (hit) return hit;
  }
  return null;
}

/**
 * 將營運 catalog 門市與績效門市（Store）對應至 RetailStore。
 * 僅更新 region／啟用狀態，不覆寫已手動設定的店名與工時。
 * 對應使用與 Excel 匯入相同的模糊比對，避免「女中」與「女中店」各建一筆。
 */
export async function ensureRetailStoresFromPerformance(): Promise<RetailStoreSyncResult> {
  const perfStores = await listPerformanceStoresForFilter();
  const retailStores = await prisma.retailStore.findMany({
    select: { id: true, storeName: true, region: true },
  });

  let created = 0;
  let updated = 0;

  for (const perf of perfStores) {
    const storeKey = perf.catalogKey;
    const labels = [perf.storeName, formatOpsStoreLabel(storeKey), storeKey];
    const existing = findExistingRetail(storeKey, labels, retailStores);

    if (existing) {
      const row = await prisma.retailStore.findUnique({
        where: { id: existing.id },
        select: { isActive: true, region: true },
      });
      if (
        row &&
        (row.region !== perf.region || !row.isActive)
      ) {
        await prisma.retailStore.update({
          where: { id: existing.id },
          data: { region: perf.region, isActive: true },
        });
        updated += 1;
        const idx = retailStores.findIndex((r) => r.id === existing.id);
        if (idx >= 0) retailStores[idx] = { ...retailStores[idx], region: perf.region };
      }
      continue;
    }

    const createdRow = await prisma.retailStore.create({
      data: {
        storeName: formatOpsStoreLabel(storeKey),
        region: perf.region,
        isActive: true,
      },
      select: { id: true, storeName: true, region: true },
    });
    retailStores.push(createdRow);
    created += 1;
  }

  const catalogSlots = getOpsCatalogStoreCount();
  return {
    catalogSlots,
    matchedPerformance: perfStores.length,
    created,
    updated,
    skippedNoPerformance: catalogSlots - perfStores.length,
  };
}
