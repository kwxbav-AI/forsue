"use client";

import {
  REGION_FILTER_PREFIX,
  orderedStoreOpsRetailStores,
  storeOpsRegionLabel,
  type StoreOpsRegion,
} from "@/lib/store-ops-retail-stores";
import type { StoreOpsStore } from "@/hooks/use-store-ops-context";

type Props = {
  stores: StoreOpsStore[];
  value: string;
  onChange: (value: string) => void;
  /** filter：列表篩選（可含全部）；publish：公佈對象；storeOnly：僅單店 */
  mode?: "filter" | "publish" | "storeOnly";
  className?: string;
};

const REGIONS: StoreOpsRegion[] = ["桃園區", "宜蘭區"];

export function StoreOpsStoreFilterSelect({
  stores,
  value,
  onChange,
  mode = "filter",
  className = "rounded-lg border border-slate-300 px-3 py-2 text-sm",
}: Props) {
  const retailStores = orderedStoreOpsRetailStores(stores);

  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {mode === "filter" ?
        <option value="all">全部負責門市</option>
      : null}
      {mode !== "storeOnly" ?
        REGIONS.map((region) => (
          <option key={region} value={`${REGION_FILTER_PREFIX}${region}`}>
            {storeOpsRegionLabel(region)}
          </option>
        ))
      : null}
      <optgroup label="單一店別">
        {retailStores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.storeName}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
