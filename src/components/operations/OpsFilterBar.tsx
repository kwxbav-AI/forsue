"use client";

import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import { OPS_REVENUE_METRICS_START_YMD } from "@/lib/performance-metrics-range";
import type { OpsStoreOption } from "@/types/operations";

export type OpsFilterBarProps = {
  startDate: string;
  endDate: string;
  region: string;
  storeId: string;
  stores: OpsStoreOption[];
  regionOptions?: string[];
  loading?: boolean;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onRegionChange: (region: string, firstStoreIdInRegion: string) => void;
  onStoreIdChange: (storeId: string) => void;
  onRefresh: () => void;
};

export function OpsFilterBar({
  startDate,
  endDate,
  region,
  storeId,
  stores,
  regionOptions,
  loading = false,
  onStartDateChange,
  onEndDateChange,
  onRegionChange,
  onStoreIdChange,
  onRefresh,
}: OpsFilterBarProps) {
  const regions =
    regionOptions && regionOptions.length >= OPS_FILTER_REGIONS.length
      ? regionOptions
      : [...OPS_FILTER_REGIONS];

  const filteredStores = stores.filter((s) => !region || s.region === region);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">開始日期</span>
        <input
          type="date"
          value={startDate}
          min={OPS_REVENUE_METRICS_START_YMD}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-slate-500">結束日期</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
      </label>
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
