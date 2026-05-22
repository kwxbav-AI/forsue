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
import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import { currentMonthRangeLocal } from "@/lib/operations-default-dates";
import { OPS_REVENUE_METRICS_START_YMD } from "@/lib/performance-metrics-range";

type StoreOption = {
  id: string;
  storeName: string;
  region: string;
  catalogKey?: string;
};

type PerfData = {
  startDate: string;
  endDate: string;
  region: string | null;
  storeId: string | null;
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
    achievementStores: {
      green: string[];
      yellow: string[];
      red: string[];
    };
    monthLabel: string;
  };
  stores: StoreOption[];
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

function formatPctOne(n: number) {
  return `${Number(n).toFixed(1)}%`;
}

/** 桃園目標(淺藍)→桃園實際(深藍)→宜蘭目標(淺紫)→宜蘭實際(深紫) */
const REGION_CHART_COLORS = {
  "桃園區": { target: "#93c5fd", actual: "#1e40af" },
  "宜蘭區": { target: "#c4b5fd", actual: "#6d28d9" },
} as const;

function AchievementBucketCard({
  count,
  title,
  pct,
  hint,
  storeNames,
  tone,
}: {
  count: number;
  title: string;
  pct: number;
  hint?: string;
  storeNames: string[];
  tone: "green" | "amber" | "rose";
}) {
  const styles = {
    green: {
      box: "bg-green-50 border-green-100",
      count: "text-green-700",
      title: "text-green-800",
      pct: "text-green-600",
      hint: "text-green-600/80",
      pop: "border-green-200 bg-white text-green-900",
    },
    amber: {
      box: "bg-amber-50 border-amber-100",
      count: "text-amber-700",
      title: "text-amber-800",
      pct: "text-amber-600",
      hint: "text-amber-600/80",
      pop: "border-amber-200 bg-white text-amber-900",
    },
    rose: {
      box: "bg-rose-50 border-rose-100",
      count: "text-rose-700",
      title: "text-rose-800",
      pct: "text-rose-600",
      hint: "text-rose-600/80",
      pop: "border-rose-200 bg-white text-rose-900",
    },
  }[tone];

  return (
    <div className={`group relative rounded-xl border p-6 text-center ${styles.box}`}>
      <p className={`text-4xl font-bold ${styles.count}`}>{count}</p>
      <p className={`mt-2 font-medium ${styles.title}`}>{title}</p>
      <p className={`text-sm ${styles.pct}`}>{formatPctOne(pct)}</p>
      {hint ? <p className={`text-[10px] mt-1 ${styles.hint}`}>{hint}</p> : null}
      {storeNames.length > 0 ?
        <div
          className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-[min(100%,280px)] -translate-x-1/2 rounded-lg border px-3 py-2 text-left text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${styles.pop}`}
        >
          <p className="font-semibold mb-1">{title}清單</p>
          <ul className="space-y-0.5">
            {storeNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      : count > 0 ?
        <div
          className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-lg border px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100 ${styles.pop}`}
        >
          無門市名稱
        </div>
      : null}
    </div>
  );
}

export default function OperationsPerformancePage() {
  const defaults = currentMonthRangeLocal();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [region, setRegion] = useState("");
  const [storeId, setStoreId] = useState("");
  const [metaStores, setMetaStores] = useState<StoreOption[]>([]);
  const [tab, setTab] = useState<TabId>("trend");
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/operations/dashboard");
      if (res.ok) {
        const json = await res.json();
        setMetaStores(json.meta?.stores ?? []);
      }
    })();
  }, []);

  const regionOptions = useMemo(() => [...OPS_FILTER_REGIONS], []);

  const filteredStores = useMemo(
    () => metaStores.filter((s) => !region || s.region === region),
    [metaStores, region]
  );

  const load = useCallback(async () => {
    if (!startDate || !endDate || startDate > endDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (storeId) params.set("storeId", storeId);
      else if (region) params.set("region", region);
      const res = await fetch(`/api/operations/performance-analysis?${params}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, region, storeId]);

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
        <p className="text-sm text-slate-500 mt-1">
          深入門市業績達成、趨勢與對標分析
          {data ? ` · ${data.startDate} ~ ${data.endDate}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">開始</span>
          <input
            type="date"
            value={startDate}
            min={OPS_REVENUE_METRICS_START_YMD}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">結束</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">區域</span>
          <select
            value={region}
            onChange={(e) => {
              const newRegion = e.target.value;
              setRegion(newRegion);
              if (!newRegion) {
                setStoreId("");
                return;
              }
              const first = metaStores.find((s) => s.region === newRegion);
              setStoreId(first?.id ?? "");
            }}
            className="min-w-[110px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全區</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">門市</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部門市</option>
            {filteredStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
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
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                  <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                  <Legend />
                  <Bar dataKey="targetRevenue" name="目標營收" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualRevenue" name="實際營收" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800">人均產值趨勢</h2>
            <p className="text-xs text-slate-500 mb-3">營收 / 工時變化</p>
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
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
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      : null}

      {data && tab === "regional" ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">區域對標</h2>
          <p className="text-xs text-slate-500 mb-3">桃園區 & 宜蘭區 · 月度營收與目標對比</p>
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionalChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                <Legend />
                {(["桃園區", "宜蘭區"] as const).flatMap((region) => {
                  const colors = REGION_CHART_COLORS[region];
                  if (!data.regionalBenchmark.some((r) => r.region === region)) {
                    return [];
                  }
                  return [
                    <Bar
                      key={`${region}-target`}
                      dataKey={`${region}_target`}
                      name={`${region} 目標`}
                      fill={colors.target}
                      radius={[4, 4, 0, 0]}
                    />,
                    <Bar
                      key={`${region}-actual`}
                      dataKey={`${region}_actual`}
                      name={`${region} 實際`}
                      fill={colors.actual}
                      radius={[4, 4, 0, 0]}
                    />,
                  ];
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      : null}

      {data && tab === "ranking" ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">門市排名</h2>
          <p className="text-xs text-slate-500 mb-3">
            依區間工效比達標次數（{data.startDate} ~ {data.endDate}）
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
            區間營收達成情況（{data?.startDate} ~ {data?.endDate} · 實際營收 ÷ 業績目標）
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <AchievementBucketCard
              count={a.green}
              title="達標門市"
              pct={a.greenPct}
              storeNames={a.achievementStores?.green ?? []}
              tone="green"
            />
            <AchievementBucketCard
              count={a.yellow}
              title="接近達標"
              pct={a.yellowPct}
              hint="達成率 80%～99%"
              storeNames={a.achievementStores?.yellow ?? []}
              tone="amber"
            />
            <AchievementBucketCard
              count={a.red}
              title="未達標"
              pct={a.redPct}
              hint="達成率 < 80%"
              storeNames={a.achievementStores?.red ?? []}
              tone="rose"
            />
          </div>
        </div>
      : null}

      {!data && loading ?
        <p className="text-center text-slate-500 py-12">載入中…</p>
      : null}
    </div>
  );
}
