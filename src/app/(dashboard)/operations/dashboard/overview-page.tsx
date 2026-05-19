"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Target,
  Clock,
  Store,
  AlertTriangle,
  Megaphone,
} from "lucide-react";

const METRICS_START = "2026-04-01";
const STATUS_COLOR = { green: "#16a34a", yellow: "#d97706", red: "#dc2626", none: "#94a3b8" };

type OverviewStore = {
  storeId: string;
  storeName: string;
  region: string;
  revenue: number;
  laborHours: number;
  efficiencyRatio: number | null;
  status: "green" | "yellow" | "red" | "none";
  statusLabel: string;
  achievementPct: number | null;
};

type OverviewData = {
  startDate: string;
  endDate: string;
  summary: {
    storeCount: number;
    totalRevenue: number;
    totalLaborHours: number;
    efficiencyRatio: number | null;
    green: number;
    yellow: number;
    red: number;
    achievementRate: number | null;
  };
  regionStats: {
    region: string;
    storeCount: number;
    achievementRate: number | null;
    green: number;
    yellow: number;
    red: number;
  }[];
  stores: OverviewStore[];
};

type KpiMetrics = {
  totalRevenue: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  yoyGrowthRate: number | null;
  periodStartDate?: string;
  periodEndDate?: string;
};

function formatMoney(n: number) {
  return Math.round(n).toLocaleString("zh-TW");
}

function KpiCard({
  title,
  value,
  sub,
  icon,
  accent,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-l-4"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub ? <p className="text-xs text-slate-500 mt-0.5">{sub}</p> : null}
        </div>
        <div className="rounded-lg p-2" style={{ backgroundColor: `${accent}18`, color: accent }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

const PLACEHOLDER_CAMPAIGNS = [
  { name: "春季促銷活動", progress: 95, note: "C 階段：待串接活動 API" },
  { name: "會員日特惠", progress: 60, note: "C 階段規劃中" },
];

export default function OperationsOverviewPage() {
  const today = formatLocalDateInput();
  const [startDate, setStartDate] = useState(METRICS_START);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [kpi, setKpi] = useState<KpiMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (region) params.set("region", region);
      const [ovRes, dashRes] = await Promise.all([
        fetch(`/api/operations/overview?${params}`),
        fetch(`/api/operations/dashboard?${params}`),
      ]);
      if (ovRes.ok) setOverview(await ovRes.json());
      if (dashRes.ok) {
        const d = await dashRes.json();
        setKpi(d.kpiMetrics ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, region]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = overview?.stores ?? [];
  const top5 = useMemo(
    () => [...sorted].filter((s) => s.achievementPct != null).sort((a, b) => (b.achievementPct ?? 0) - (a.achievementPct ?? 0)).slice(0, 5),
    [sorted]
  );
  const bottom5 = useMemo(
    () => [...sorted].filter((s) => s.achievementPct != null).sort((a, b) => (a.achievementPct ?? 0) - (b.achievementPct ?? 0)).slice(0, 5),
    [sorted]
  );

  const pieData = overview ?
    [
      { name: "達標", value: overview.summary.green, color: STATUS_COLOR.green },
      { name: "警示", value: overview.summary.yellow, color: STATUS_COLOR.yellow },
      { name: "未達標", value: overview.summary.red, color: STATUS_COLOR.red },
    ].filter((x) => x.value > 0)
  : [];

  const regionChart = overview?.regionStats ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-800" />
            營運總覽
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {overview ? `${overview.startDate} ~ ${overview.endDate}` : "—"}　
            {overview?.summary.storeCount ?? "—"} 間門市
            {region ? ` · ${region}` : " · 全區"}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-slate-500 text-xs mb-1">開始</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-slate-500 text-xs mb-1">結束</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部區域</option>
            {OPS_FILTER_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "載入中…" : "重新整理"}
          </button>
          <Link
            href="/operations/analysis"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-white"
          >
            門市深度分析
          </Link>
        </div>
      </div>

      {/* 桃園+宜蘭 KPI */}
      {kpi ?
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            title="全公司營收達成值"
            value={formatMoney(kpi.totalRevenue)}
            sub={`${kpi.periodStartDate ?? ""} ~ ${kpi.periodEndDate ?? ""} · 宜蘭+桃園`}
            icon={<Target className="h-5 w-5" />}
            accent="#0284c7"
          />
          <KpiCard
            title="營運部工效比"
            value={kpi.efficiencyRatio != null ? Math.round(kpi.efficiencyRatio).toLocaleString("zh-TW") : "—"}
            sub="元 / hr"
            icon={<Clock className="h-5 w-5" />}
            accent="#1e40af"
          />
          <KpiCard
            title="YoY 營收成長率"
            value={
              kpi.yoyGrowthRate != null ?
                `${kpi.yoyGrowthRate > 0 ? "+" : ""}${kpi.yoyGrowthRate.toFixed(1)}%`
              : "—"
            }
            sub="較去年同期"
            icon={<Activity className="h-5 w-5" />}
            accent="#16a34a"
          />
        </div>
      : null}

      {overview ?
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              title="區間營業額"
              value={formatMoney(overview.summary.totalRevenue)}
              sub="元"
              icon={<Store className="h-5 w-5" />}
              accent="#1e40af"
            />
            <KpiCard
              title="工效比達標率"
              value={overview.summary.achievementRate != null ? `${overview.summary.achievementRate}%` : "—"}
              sub={`達標 ${overview.summary.green} / ${overview.summary.storeCount} 間`}
              icon={<Target className="h-5 w-5" />}
              accent="#16a34a"
            />
            <KpiCard
              title="總工時"
              value={overview.summary.totalLaborHours.toFixed(1)}
              sub="hr"
              icon={<Clock className="h-5 w-5" />}
              accent="#7c3aed"
            />
            <KpiCard
              title="區間工效比"
              value={
                overview.summary.efficiencyRatio != null ?
                  Math.round(overview.summary.efficiencyRatio).toLocaleString("zh-TW")
                : "—"
              }
              sub="元 / hr"
              icon={<Activity className="h-5 w-5" />}
              accent="#0d9488"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">門市健康分佈</h2>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                    {pieData.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                <span className="text-green-600">達標 {overview.summary.green}</span>
                <span className="text-amber-600">警示 {overview.summary.yellow}</span>
                <span className="text-red-600">未達標 {overview.summary.red}</span>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">區域工效比達標率</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={regionChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v}%`, "達標率"]} />
                  <Bar dataKey="achievementRate" fill="#1e40af" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">達標 Top 5（工效比）</h2>
              <ul className="space-y-2 text-sm">
                {top5.map((s, i) => (
                  <li key={s.storeId} className="flex justify-between">
                    <span>
                      {i + 1}. {s.storeName}
                    </span>
                    <span className="font-medium text-green-700">{s.achievementPct}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">待改善 Bottom 5</h2>
              <ul className="space-y-2 text-sm">
                {bottom5.map((s, i) => (
                  <li key={s.storeId} className="flex justify-between">
                    <span>
                      {i + 1}. {s.storeName}
                    </span>
                    <span className="font-medium text-red-600">{s.achievementPct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                督導高優先預警
                <span className="text-xs font-normal text-amber-700">（C 階段）</span>
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                目前依工效比「未達標」門市：
                {sorted.filter((s) => s.status === "red").map((s) => s.storeName).join("、") || "無"}
              </p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-violet-600" />
                行銷活動進度
                <span className="text-xs font-normal text-violet-700">（示意）</span>
              </h2>
              <ul className="mt-3 space-y-3">
                {PLACEHOLDER_CAMPAIGNS.map((c) => (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm">
                      <span>{c.name}</span>
                      <span>{c.progress}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-violet-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${c.progress}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">門市狀態一覽</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {sorted.map((s) => (
                <Link
                  key={s.storeId}
                  href={`/operations/analysis?store=${encodeURIComponent(s.storeId)}`}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: STATUS_COLOR[s.status] }}
                    />
                    <span className="text-sm font-medium text-slate-800 truncate">{s.storeName}</span>
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {s.achievementPct != null ? `${s.achievementPct}%` : "—"}
                  </p>
                  <p className="text-[10px] text-slate-500">{s.statusLabel}</p>
                </Link>
              ))}
            </div>
          </div>
        </>
      : loading ?
        <p className="text-center text-slate-500 py-12">載入中…</p>
      : null}
    </div>
  );
}
