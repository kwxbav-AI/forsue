"use client";

import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import type { OpsStoreOption } from "@/types/operations";

const OPS_REVENUE_METRICS_START_YM = "2025-01";

export type OpsFilterBarProps = {
  startMonth: string;
  endMonth: string;
  region: string;
  storeId: string;
  stores: OpsStoreOption[];
  regionOptions?: string[];
  fixedRegion?: string;
  loading?: boolean;
  onStartMonthChange: (value: string) => void;
  onEndMonthChange: (value: string) => void;
  onRegionChange: (region: string, firstStoreIdInRegion: string) => void;
  onStoreIdChange: (storeId: string) => void;
  onRefresh: () => void;
};

export function OpsFilterBar({
  startMonth,
  endMonth,
  region,
  storeId,
  stores,
  regionOptions,
  fixedRegion,
  loading = false,
  onStartMonthChange,
  onEndMonthChange,
  onRegionChange,
  onStoreIdChange,
  onRefresh,
}: OpsFilterBarProps) {
  const regions =
    fixedRegion ? [fixedRegion]
    : regionOptions && regionOptions.length > 0
      ? regionOptions
      : OPS_FILTER_REGIONS.filter((r) => r !== "台北區");

  const filteredStores = stores.filter((s) => !region || s.region === region);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">開始月份</span>
        <input
          type="month"
          value={startMonth}
          min={OPS_REVENUE_METRICS_START_YM}
          onChange={(e) => onStartMonthChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">結束月份</span>
        <input
          type="month"
          value={endMonth}
          min={OPS_REVENUE_METRICS_START_YM}
          onChange={(e) => onEndMonthChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      {!fixedRegion && (
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">區域</span>
          <select
            value={region}
            onChange={(e) => {
              const newRegion = e.target.value;
              const first = stores.find((s) => s.region === newRegion);
              onRegionChange(newRegion, first?.id ?? "");
            }}
            className="min-w-[110px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">全部區域</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">門市</span>
        <select
          value={storeId}
          onChange={(e) => onStoreIdChange(e.target.value)}
          className="min-w-[140px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">請選擇門市</option>
          {filteredStores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.storeName}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {loading ? "載入中…" : "重新整理"}
      </button>
    </div>
  );
}
