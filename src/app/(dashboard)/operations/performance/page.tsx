"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon } from "lucide-react";

type PerfData = {
  startDate: string;
  endDate: string;
  months: number;
  revenueTrend: { label: string; actualRevenue: number; targetRevenue: number }[];
  productivityTrend: { label: string; perCapita: number | null }[];
  regionalBenchmark: {
    region: string;
    months: { label: string; actualRevenue: number; targetRevenue: number }[];
  }[];
  storeRanking: {
    storeId: string;
    storeName: string;
    region: string;
    targetMetDays: number;
  }[];
  achievementSummary: {
    green: number;
    yellow: number;
    red: number;
    total: number;
    greenPct: number;
    yellowPct: number;
    redPct: number;
    monthLabel: string;
  };
  stores: { id: string; storeName: string; region: string }[];
};

const TABS = [
  { id: "trend", label: "趨勢分析" },
  { id: "regional", label: "區域對標" },
  { id: "ranking", label: "門市排名" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function formatWan(n: number) {
  return Math.round(n / 10000).toLocaleString("zh-TW");
}

export default function OperationsPerformancePage() {
  const [months, setMonths] = useState<3 | 6 | 12>(6);
  const [storeId, setStoreId] = useState("");
  const [tab, setTab] = useState<TabId>("trend");
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ months: String(months) });
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/operations/performance-analysis?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [months, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const regionalChartData = useMemo(() => {
    if (!data?.regionalBenchmark.length) return [];
    const labels = data.regionalBenchmark[0]?.months.map((m) => m.label) ?? [];
    return labels.map((label, i) => {
      const row: Record<string, string | number> = { label };
      for (const r of data.regionalBenchmark) {
        row[`${r.region}_actual`] = r.months[i]?.actualRevenue ?? 0;
        row[`${r.region}_target`] = r.months[i]?.targetRevenue ?? 0;
      }
      return row;
    });
  }, [data]);

  const a = data?.achievementSummary;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <LineChartIcon className="h-6 w-6 text-blue-800" />
          業績分析
        </h1>
        <p className="text-sm text-slate-500 mt-1">深入門市業績達成、趨勢與對標分析</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">選擇門市</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[160px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">全部門市</option>
            {data?.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">時間範圍</span>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as 3 | 6 | 12)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={3}>過去 3 個月</option>
            <option value={6}>過去 6 個月</option>
            <option value={12}>過去 12 個月</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="self-end rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {loading ? "載入中…" : "重新整理"}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ?
                "border-blue-700 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data && tab === "trend" ?
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800">營收趨勢</h2>
            <p className="text-xs text-slate-500 mb-3">月度營收與目標對比</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                <Legend />
                <Bar dataKey="actualRevenue" name="實際營收" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="targetRevenue" name="目標營收" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800">人均產值趨勢</h2>
            <p className="text-xs text-slate-500 mb-3">營收 / 工時變化</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.productivityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} 元/hr`, "人均產值"]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="perCapita"
                  name="人均產值"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      : null}

      {data && tab === "regional" ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">區域對標</h2>
          <p className="text-xs text-slate-500 mb-3">桃園區 & 宜蘭區 · 月度營收與目標對比</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={regionalChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
              <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
              <Legend />
              {data.regionalBenchmark.map((r, idx) => (
                <Bar
                  key={`${r.region}-a`}
                  dataKey={`${r.region}_actual`}
                  name={`${r.region} 實際`}
                  fill={idx === 0 ? "#2563eb" : "#0d9488"}
                  radius={[4, 4, 0, 0]}
                />
              ))}
              {data.regionalBenchmark.map((r) => (
                <Bar
                  key={`${r.region}-t`}
                  dataKey={`${r.region}_target`}
                  name={`${r.region} 目標`}
                  fill="#e2e8f0"
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      : null}

      {data && tab === "ranking" ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">門市排名</h2>
          <p className="text-xs text-slate-500 mb-3">
            依 {data.achievementSummary.monthLabel || "當月"} 工效比達標次數
          </p>
          <ol className="space-y-2">
            {data.storeRanking.map((s, i) => (
              <li
                key={s.storeId}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium text-slate-400 w-6 inline-block">{i + 1}</span>
                  {s.storeName}
                  <span className="ml-2 text-xs text-slate-400">{s.region}</span>
                </span>
                <span className="font-semibold text-blue-800">{s.targetMetDays} 次</span>
              </li>
            ))}
          </ol>
        </div>
      : null}

      {a ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">營收達成率</h2>
          <p className="text-xs text-slate-500 mb-4">
            本月營收達成情況（{a.monthLabel} · 實際營收 ÷ 月業績目標）
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-green-50 border border-green-100 p-6 text-center">
              <p className="text-4xl font-bold text-green-700">{a.green}</p>
              <p className="mt-2 font-medium text-green-800">達標門市</p>
              <p className="text-sm text-green-600">{a.greenPct}%</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-6 text-center">
              <p className="text-4xl font-bold text-amber-700">{a.yellow}</p>
              <p className="mt-2 font-medium text-amber-800">接近達標</p>
              <p className="text-sm text-amber-600">{a.yellowPct}%</p>
              <p className="text-[10px] text-amber-600/80 mt-1">達成率 80%～99%</p>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-6 text-center">
              <p className="text-4xl font-bold text-rose-700">{a.red}</p>
              <p className="mt-2 font-medium text-rose-800">未達標</p>
              <p className="text-sm text-rose-600">{a.redPct}%</p>
              <p className="text-[10px] text-rose-600/80 mt-1">達成率 &lt; 80%</p>
            </div>
          </div>
        </div>
      : null}

      {!data && loading ?
        <p className="text-center text-slate-500 py-12">載入中…</p>
      : null}
    </div>
  );
}
