"use client";

import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { groupStoreOpsRetailStoresByRegion } from "@/lib/store-ops-retail-stores";

type StoreRow = { id: string; storeName: string; region?: string | null };

type Props = {
  stores: StoreRow[];
  selectedIds: string[];
  onToggle: (storeId: string) => void;
  onToggleRegion?: (storeIds: string[], select: boolean) => void;
};

export function StoreOpsStoreCheckboxGrid({
  stores,
  selectedIds,
  onToggle,
  onToggleRegion,
}: Props) {
  const groups = groupStoreOpsRetailStoresByRegion(stores);

  if (groups.length === 0) {
    return (
      <p className="text-xs" style={{ color: OPS_COLORS.status.none.label }}>
        尚無可選門市
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const ids = g.stores.map((s) => s.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
        return (
          <div key={g.region}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium" style={{ color: OPS_COLORS.achievement.value }}>
                {g.label}
              </p>
              {onToggleRegion ?
                <button
                  type="button"
                  className="text-[10px] underline"
                  style={{ color: OPS_COLORS.revenue.label }}
                  onClick={() => onToggleRegion(ids, !allSelected)}
                >
                  {allSelected ? "取消全區" : "全選此區"}
                </button>
              : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.stores.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
                  style={{
                    borderColor: OPS_COLORS.hours.border,
                    color: OPS_COLORS.hours.label,
                    backgroundColor: selectedIds.includes(s.id) ? OPS_COLORS.hours.bg : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => onToggle(s.id)}
                  />
                  {s.storeName}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
