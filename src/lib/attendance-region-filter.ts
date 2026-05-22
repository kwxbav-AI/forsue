import {
  OPS_REGION_CATALOG,
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";

export const ATTENDANCE_REGION_ALL_DEPARTMENTS = [
  "宜蘭區全門市",
  "桃園區全門市",
] as const;

type StoreRow = { id: string; name: string; department: string | null };

function storeIdsInCatalogRegion(
  allStores: StoreRow[],
  region: "宜蘭區" | "桃園區"
): string[] {
  const group = OPS_REGION_CATALOG.find((g) => g.region === region);
  if (!group) return [];
  const keys = new Set(group.storeNames.map(normalizeStoreKey));
  return allStores
    .filter((s) => {
      const n = normalizeStoreKey(s.name);
      if (keys.has(n)) return true;
      return group.storeNames.some((ck) => storeNameMatchesCatalogKey(s.name, ck));
    })
    .map((s) => s.id);
}

/** 部門篩選：支援「宜蘭區全門市」「桃園區全門市」與既有關鍵字比對 */
export function resolveStoreIdsForAttendanceDepartment(
  department: string,
  allStores: StoreRow[]
): string[] | null {
  const trimmed = department.trim();
  if (!trimmed) return null;
  if (trimmed === "宜蘭區全門市") return storeIdsInCatalogRegion(allStores, "宜蘭區");
  if (trimmed === "桃園區全門市") return storeIdsInCatalogRegion(allStores, "桃園區");

  const keyword = trimmed.toLowerCase();
  return allStores
    .filter((s) =>
      ((s.department || "") + " " + (s.name || "")).toLowerCase().includes(keyword)
    )
    .map((s) => s.id);
}
