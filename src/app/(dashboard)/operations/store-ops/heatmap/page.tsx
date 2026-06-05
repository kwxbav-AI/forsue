"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { HEATMAP_SCALE, OPS_COLORS } from "@/lib/ops-color-tokens";

type HeatmapResponse = {
  month: string;
  stores: { id: string; storeName: string; region: string | null }[];
  cells: { date: string; storeId: string; customerCount: number }[];
};

function monthInputDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StoreOpsHeatmapPage() {
  const [month, setMonth] = useState(monthInputDefault);
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/operations/store-ops/heatmap?month=${month}`);
    if (res.ok) setData(await res.json());
    else setData(null);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const { maxCount, cellMap, dates } = useMemo(() => {
    if (!data) return { maxCount: 0, cellMap: new Map<string, number>(), dates: [] as string[] };
    const map = new Map<string, number>();
    let max = 0;
    const dateSet = new Set<string>();
    for (const c of data.cells) {
      map.set(`${c.storeId}|${c.date}`, c.customerCount);
      dateSet.add(c.date);
      if (c.customerCount > max) max = c.customerCount;
    }
    return {
      maxCount: max,
      cellMap: map,
      dates: [...dateSet].sort(),
    };
  }, [data]);

  function heatColor(count: number) {
    if (count <= 0 || maxCount <= 0) return OPS_COLORS.status.none.bg;
    const level = Math.min(5, Math.floor((count / maxCount) * 5));
    return HEATMAP_SCALE[level];
  }

  return (
    <div className="p-6 max-w-6xl">
      <StoreOpsPageHeader
        title="客流熱力圖"
        subtitle="資料來源：DailyStorePerformance.customerCount"
        action={
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        }
      />
      {loading ?
        <p className="text-sm text-slate-500">載入中…</p>
      : !data ?
        <p className="text-sm text-slate-500">無資料</p>
      : <div
          className="overflow-x-auto rounded-xl border bg-white p-4 shadow-sm"
          style={{ borderColor: OPS_COLORS.customer.border }}
        >
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white px-2 py-1 text-left">門市</th>
                {dates.map((d) => (
                  <th key={d} className="px-1 py-1 font-normal text-slate-500">
                    {d.slice(8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.stores.map((s) => (
                <tr key={s.id}>
                  <td
                    className="sticky left-0 bg-white px-2 py-1 font-medium whitespace-nowrap"
                    style={{ color: OPS_COLORS.customer.value }}
                  >
                    {s.storeName}
                  </td>
                  {dates.map((d) => {
                    const count = cellMap.get(`${s.id}|${d}`) ?? 0;
                    return (
                      <td
                        key={d}
                        className="px-1 py-1 text-center tabular-nums"
                        style={{ backgroundColor: heatColor(count) }}
                        title={`${d}：${count} 人`}
                      >
                        {count > 0 ? count : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}
