"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  revenueSum: number;
  hoursSum: number;
  efficiencyRatio: number | null;
};

type ApiResponse = {
  startDate: string;
  endDate: string;
  perStore: Row[];
  totals: { revenueSum: number; hoursSum: number; efficiencyRatio: number | null };
};

type SortKey = "storeName" | "revenueSum" | "hoursSum" | "efficiencyRatio";
type SortDir = "asc" | "desc";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function ReportsChartsPage() {
  const [startDate, setStartDate] = useState(() => formatLocalDateInput());
  const [endDate, setEndDate] = useState(() => formatLocalDateInput());
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("efficiencyRatio");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/reports/charts?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse> & { error?: string };
      if (!res.ok) {
        setData(null);
        setMessage(json.error || "讀取失敗");
        return;
      }
      setData(json as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const sortIndicator = useCallback(
    (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""),
    [sortDir, sortKey]
  );

  const sorted = useMemo(() => {
    const list = data?.perStore ?? [];
    const dir = sortDir === "asc" ? 1 : -1;
    const getVal = (r: Row): string | number => {
      switch (sortKey) {
        case "storeName":
          return r.storeName ?? "";
        case "revenueSum":
          return r.revenueSum;
        case "hoursSum":
          return r.hoursSum;
        case "efficiencyRatio":
          return r.efficiencyRatio ?? -Infinity;
      }
    };
    return [...list].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "zh-Hant") * dir;
    });
  }, [data?.perStore, sortDir, sortKey]);

  const totals = data?.totals ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">圖表</h1>
        <Link
          href="/reports"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回報表區
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-sm text-slate-600">起始日</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-600">結束日</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          className="h-[38px] rounded bg-sky-600 px-4 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? "載入中…" : "查詢"}
        </button>
        {totals ? (
          <div className="ml-auto flex flex-wrap gap-4 text-sm text-slate-700">
            <span>
              <span className="text-slate-500">營收加總：</span>
              <strong>{Math.round(totals.revenueSum).toLocaleString("zh-TW")}</strong>
            </span>
            <span>
              <span className="text-slate-500">工時加總：</span>
              <strong>{round2(totals.hoursSum).toLocaleString("zh-TW")}</strong>
            </span>
            <span>
              <span className="text-slate-500">工效比：</span>
              <strong>
                {totals.efficiencyRatio == null ? "—" : Math.round(totals.efficiencyRatio).toLocaleString("zh-TW")}
              </strong>
            </span>
          </div>
        ) : null}
      </div>

      {message ? (
        <p className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-20 w-[220px] min-w-[220px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("storeName")} className="hover:underline">
                    分店{sortIndicator("storeName")}
                  </button>
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("revenueSum")} className="hover:underline">
                    營收{sortIndicator("revenueSum")}
                  </button>
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("hoursSum")} className="hover:underline">
                    總工時{sortIndicator("hoursSum")}
                  </button>
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("efficiencyRatio")} className="hover:underline">
                    工效比{sortIndicator("efficiencyRatio")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-slate-500">
                    載入中…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-4 text-slate-500">
                    此區間無資料
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                  <tr key={r.storeId} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[220px] min-w-[220px] bg-white px-4 py-2 font-medium">
                      {r.storeName}
                      {r.storeCode ? <span className="ml-2 text-xs text-slate-400">{r.storeCode}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">{Math.round(r.revenueSum).toLocaleString("zh-TW")}</td>
                    <td className="px-4 py-2 text-right">{round2(r.hoursSum).toLocaleString("zh-TW")}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {r.efficiencyRatio == null ? "—" : Math.round(r.efficiencyRatio).toLocaleString("zh-TW")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">工效比長條圖</h2>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted.map((r) => ({
                  storeName: r.storeName,
                  revenueSum: r.revenueSum,
                  hoursSum: r.hoursSum,
                  efficiencyRatio: r.efficiencyRatio == null ? 0 : r.efficiencyRatio,
                }))}
                margin={{ top: 8, right: 8, bottom: 56, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="storeName" interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis
                  tickFormatter={(v) => (Number.isFinite(v) ? Math.round(Number(v)).toLocaleString("zh-TW") : "")}
                />
                <Tooltip
                  formatter={(value: any, name: any, props: any) => {
                    if (name === "efficiencyRatio") {
                      return [Math.round(Number(value)).toLocaleString("zh-TW"), "工效比"];
                    }
                    return [value, name];
                  }}
                  labelFormatter={(label) => `門市：${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="efficiencyRatio" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            工效比 = 區間營收加總 ÷ 區間工時加總（hours=0 時視為 0）。
          </p>
        </div>
      </div>
    </div>
  );
}

