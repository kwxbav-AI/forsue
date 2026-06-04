"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import { DUAL_OPS_REGIONS, OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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
  Users,
  Receipt,
} from "lucide-react";

import { OPS_REVENUE_METRICS_START_YMD } from "@/lib/performance-metrics-range";
import { currentMonthStartYmdLocal } from "@/lib/operations-default-dates";

function defaultOverviewStartDate() {
  const ymd = currentMonthStartYmdLocal();
  return ymd < OPS_REVENUE_METRICS_START_YMD ? OPS_REVENUE_METRICS_START_YMD : ymd;
}

/** 門市營收達成分佈與門市狀態圖共用色 */
const ACHIEVEMENT_COLOR = {
  green: "#bbf7d0",
  pink: "#fbcfe8",
  none: "#e2e8f0",
};

function achievementBarFill(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return ACHIEVEMENT_COLOR.pink;
  if (rate >= 100) return ACHIEVEMENT_COLOR.green;
  return ACHIEVEMENT_COLOR.pink;
}

const REGION_PIE_COLOR: Record<string, string> = {
  桃園區: "#e9a2a6",
  宜蘭區: "#067086",
};

type OverviewStore = {
  storeId: string;
  storeName: string;
  region: string;
  revenue: number;
  revenueTarget: number | null;
  revenueAchievementRate: number | null;
  laborHours: number;
  efficiencyRatio: number | null;
  targetMetDays: number;
  status: "green" | "yellow" | "red" | "none";
  statusLabel: string;
};

type MonthlyTrendPoint = {
  label: string;
  revenueWan: number;
  achievementRate: number | null;
};

type PriorityAlert = {
  storeId: string;
  storeName: string;
  region: string;
  priorityScore: number;
  reasons: string[];
  revenue: number;
  revenueAchievementRate: number | null;
  efficiencyRatio: number | null;
  laborHours: number;
  targetMetDays: number;
  status: OverviewStore["status"];
};

type OverviewData = {
  startDate: string;
  endDate: string;
  monthlyTrend: MonthlyTrendPoint[];
  summary: {
    storeCount: number;
    totalRevenue: number;
    totalTarget: number;
    totalLaborHours: number;
    efficiencyRatio: number | null;
    revenueAchievementRate: number | null;
    green: number;
    yellow: number;
    red: number;
  };
  regionStats: {
    region: string;
    achievementRate: number | null;
    revenue: number;
  }[];
  stores: OverviewStore[];
  topStores?: OverviewStore[];
  bottomStores?: OverviewStore[];
  priorityAlerts?: PriorityAlert[];
  dualRegionRevenueShare?: { region: string; revenue: number; sharePct: number }[];
  customerMetrics?: {
    totalCustomerCount: number;
    avgOrderValue: number | null;
    daysWithData: number;
  };
};

type KpiMetrics = {
  totalRevenue: number;
  totalTarget: number;
  revenueAchievementRate: number | null;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  yoyGrowthRate: number | null;
  periodStartDate?: string;
  periodEndDate?: string;
};

function formatMoney(n: number) {
  return Math.round(n).toLocaleString("zh-TW");
}

function formatPctOne(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(1)}%`;
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

function StoreStatusTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const p = payload[0].payload as {
    storeName: string;
    revenue: number;
    revenueWan: number;
    revenueAchievementRate: number | null;
    targetMetDays: number;
    statusLabel: string;
    revenueTarget: number | null;
    efficiencyRatio: number | null;
    laborHours: number;
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg max-w-[240px]">
      <p className="font-semibold text-slate-800">{p.storeName}</p>
      <p className="mt-1 text-slate-600">
        營收 {formatMoney(p.revenue)} 元（{p.revenueWan} 萬）
      </p>
      <p className="text-slate-600">
        達成率 {formatPctOne(p.revenueAchievementRate)}
        {p.revenueTarget != null ? ` · 月目標 ${formatMoney(p.revenueTarget)}` : ""}
      </p>
      <p className="text-slate-600">達標 {p.targetMetDays} 次 · {p.statusLabel}</p>
      <p className="text-slate-500">
        工時 {p.laborHours.toFixed(1)} hr
        {p.efficiencyRatio != null ?
          ` · 工效比 ${Math.round(p.efficiencyRatio).toLocaleString("zh-TW")}`
        : ""}
      </p>
    </div>
  );
}

export default function OperationsOverviewPage() {
  const today = formatLocalDateInput();
  const [startDate, setStartDate] = useState(defaultOverviewStartDate);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [kpi, setKpi] = useState<KpiMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const heavyLoadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const includeMonthlyTrend = !heavyLoadedRef.current;
      const params = new URLSearchParams({ startDate, endDate });
      if (!includeMonthlyTrend) {
        params.set("includeMonthlyTrend", "0");
      }

      if (region) params.set("region", region);
      const ovRes = await fetch(`/api/operations/overview?${params}`);
      if (ovRes.ok) {
        const data = await ovRes.json();
        const { kpiMetrics: kpiData, ...overviewData } = data as OverviewData & {
          kpiMetrics?: KpiMetrics;
        };
        setOverview((prev) => ({
          ...overviewData,
          monthlyTrend: includeMonthlyTrend ?
            (overviewData.monthlyTrend ?? [])
          : (prev?.monthlyTrend ?? []),
        }));
        if (kpiData) setKpi(kpiData);
        if (includeMonthlyTrend) heavyLoadedRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, region]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  const top5 = overview?.topStores ?? [];
  const bottom5 = overview?.bottomStores ?? [];
  const priorityAlerts = overview?.priorityAlerts ?? [];
  const dualShare = overview?.dualRegionRevenueShare ?? [];

  const storeStatusChart = useMemo(() => {
    if (!overview) return [];
    return [...overview.stores]
      .filter((s) => s.revenue > 0 || s.revenueAchievementRate != null)
      .sort((a, b) => b.revenue - a.revenue)
      .map((s) => ({
        storeName: s.storeName,
        revenue: s.revenue,
        revenueWan: Math.round((s.revenue / 10000) * 10) / 10,
        revenueAchievementRate: s.revenueAchievementRate,
        revenueTarget: s.revenueTarget,
        targetMetDays: s.targetMetDays,
        statusLabel: s.statusLabel,
        laborHours: s.laborHours,
        efficiencyRatio: s.efficiencyRatio,
        fill: achievementBarFill(s.revenueAchievementRate),
      }));
  }, [overview]);

  const regionChart = useMemo(
    () =>
      (overview?.regionStats ?? []).filter((r) =>
        (DUAL_OPS_REGIONS as readonly string[]).includes(r.region)
      ),
    [overview?.regionStats]
  );

  const regionYAxisTicks = useMemo(() => {
    const rates = regionChart
      .map((r) => r.achievementRate)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const maxRate = rates.length > 0 ? Math.max(...rates, 100) : 100;
    const top = Math.ceil(maxRate / 20) * 20;
    const ticks: number[] = [];
    for (let t = 0; t <= top; t += 20) ticks.push(t);
    return { domain: [0, top] as [number, number], ticks };
  }, [regionChart]);

  const pieNotMet =
    overview ?
      overview.summary.storeCount - overview.summary.green
    : 0;
  const pieData = overview ?
    [
      { name: "達標", value: overview.summary.green, color: ACHIEVEMENT_COLOR.green },
      { name: "未達標", value: pieNotMet, color: ACHIEVEMENT_COLOR.pink },
    ].filter((x) => x.value > 0)
  : [];
  const customerMetrics = overview?.customerMetrics;
  const storeChartHeight = Math.min(
    Math.max(200, storeStatusChart.length * 14 + 48),
    280
  );
  const regionLabel = region || "全區";

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
            {loading ? " · 更新中…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-slate-500 text-xs mb-1">開始</span>
            <input
              type="date"
              value={startDate}
              min={OPS_REVENUE_METRICS_START_YMD}
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
        </div>
      </div>

      {overview ?
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="全公司營收目標值"
              value={formatMoney(kpi?.totalTarget ?? overview.summary.totalTarget)}
              sub={`${overview.startDate} ~ ${overview.endDate} · 桃園+宜蘭`}
              icon={<Target className="h-5 w-5" />}
              accent="#6366f1"
            />
            <KpiCard
              title="全公司營收達成值"
              value={formatMoney(kpi?.totalRevenue ?? 0)}
              sub={`${overview.startDate} ~ ${overview.endDate} · 桃園+宜蘭`}
              icon={<Store className="h-5 w-5" />}
              accent="#0284c7"
            />
            <KpiCard
              title="區間營收成長率"
              value={
                kpi?.yoyGrowthRate != null ?
                  `${kpi.yoyGrowthRate > 0 ? "+" : ""}${kpi.yoyGrowthRate.toFixed(1)}%`
                : "—"
              }
              sub={`較去年同期同區間 · 桃園+宜蘭`}
              icon={<Activity className="h-5 w-5" />}
              accent="#16a34a"
            />
            <KpiCard
              title="區間達成率"
              value={formatPctOne(kpi?.revenueAchievementRate ?? null)}
              sub="營收達成值 ÷ 營收目標值 · 桃園+宜蘭"
              icon={<Target className="h-5 w-5" />}
              accent="#0d9488"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard
              title="區間營業額"
              value={formatMoney(overview.summary.totalRevenue)}
              sub={`${overview.startDate} ~ ${overview.endDate} · ${regionLabel}`}
              icon={<Store className="h-5 w-5" />}
              accent="#1e40af"
            />
            <KpiCard
              title="營收達成率"
              value={formatPctOne(overview.summary.revenueAchievementRate)}
              sub={`月業績目標 · 達標 ${overview.summary.green} / ${overview.summary.storeCount} 間`}
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
            <KpiCard
              title="來客數（結帳單）"
              value={
                customerMetrics && customerMetrics.totalCustomerCount > 0 ?
                  customerMetrics.totalCustomerCount.toLocaleString("zh-TW")
                : "—"
              }
              sub={
                customerMetrics?.daysWithData ?
                  `區間 ${customerMetrics.daysWithData} 天有資料`
                : "請至資料上傳中心匯入"
              }
              icon={<Users className="h-5 w-5" />}
              accent="#c026d3"
            />
            <KpiCard
              title="平均客單價"
              value={
                customerMetrics?.avgOrderValue != null ?
                  `${formatMoney(customerMetrics.avgOrderValue)} 元`
                : "—"
              }
              sub="銷售總額 ÷ 來客數"
              icon={<Receipt className="h-5 w-5" />}
              accent="#ea580c"
            />
          </div>

          <p className="text-xs text-slate-500 -mt-2">
            來客數與平均客單價請至{" "}
            <Link href="/uploads" className="text-blue-700 hover:underline">
              資料上傳中心
            </Link>{" "}
            匯入「來客數／平均客單」Excel。
          </p>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">月度業績趨勢</h2>
            <p className="text-xs text-slate-500 mb-3">
              當年度 1 月至今（不受上方日期篩選影響）· 萬元 / 達標率 %
            </p>
            <div className="h-[260px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={overview.monthlyTrend ?? []}
                  margin={{ top: 8, right: 48, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="wan"
                    tick={{ fontSize: 11 }}
                    label={{ value: "萬元", angle: -90, position: "insideLeft", fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    domain={[0, "auto"]}
                    tick={{ fontSize: 11 }}
                    label={{ value: "%", angle: 90, position: "insideRight", fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(v: number, _name: string, item) => {
                      const key = String(item?.dataKey ?? "");
                      if (key === "revenueWan") return [`${v} 萬元`, "月度業績"];
                      if (key === "achievementRate") return [`${v}%`, "達標率"];
                      return [v, _name];
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="wan"
                    dataKey="revenueWan"
                    name="月度業績（萬元）"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="achievementRate"
                    name="達標率（%）"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 第四層：區域營收達成率、桃園/宜蘭營收占比 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">區域營收達成率</h2>
              <p className="text-xs text-slate-500 mb-2">
                {overview.startDate} ~ {overview.endDate} · {regionLabel}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={regionChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="region" tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={regionYAxisTicks.domain}
                    ticks={regionYAxisTicks.ticks}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: number, _n, props) => {
                      const p = props?.payload as { region?: string; revenue?: number; target?: number } | undefined;
                      const extra =
                        p?.target != null && p.target > 0 ?
                          ` · 營收 ${formatMoney(p.revenue ?? 0)} / 目標 ${formatMoney(p.target)}`
                        : "";
                      return [`${v}%${extra}`, "營收達成率"];
                    }}
                  />
                  <Bar dataKey="achievementRate" fill="#1e40af" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">桃園／宜蘭實際營收占比</h2>
              <p className="text-xs text-slate-500 mb-3">
                {overview.startDate} ~ {overview.endDate} · 桃園＋宜蘭實際營收結構
              </p>
              {dualShare.length ?
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart margin={{ top: 12, right: 12, bottom: 8, left: 12 }}>
                      <Pie
                        data={dualShare.map((r) => ({ name: r.region, value: r.revenue }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="52%"
                        innerRadius={52}
                        outerRadius={72}
                      >
                        {dualShare.map((r) => (
                          <Cell key={r.region} fill={REGION_PIE_COLOR[r.region] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number, _n, props) => [
                          `${formatMoney(Number(v))} 元`,
                          props.payload?.name ?? "",
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 text-sm mt-2 flex-wrap">
                    {dualShare.map((r) => (
                      <span key={r.region} className="text-slate-700">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                          style={{ backgroundColor: REGION_PIE_COLOR[r.region] }}
                        />
                        {r.region} {formatMoney(r.revenue)} 元（{r.sharePct}%）
                      </span>
                    ))}
                  </div>
                </>
              : <p className="text-sm text-slate-500 py-8 text-center">區間無營收資料</p>}
            </div>
          </div>

          {/* 第五層：門市營收達成分佈 1/3、門市狀況一覽 2/3 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">門市營收達成分佈</h2>
              <p className="text-xs text-slate-500 mb-2">
                達標 ≥100% 淡綠 · 未達標 &lt;100% 粉紅
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                  >
                    {pieData.map((e) => (
                      <Cell key={e.name} fill={e.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                <span className="text-green-700">達標 {overview.summary.green}</span>
                <span className="text-rose-700">未達標 {pieNotMet}</span>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">門市狀態一覽</h2>
              <p className="text-xs text-slate-500 mb-3">
                柱狀：區間營收（萬元）· 折線：營收達成率 · 柱色與達成分佈一致
              </p>
              {storeStatusChart.length ?
                <div style={{ height: storeChartHeight }} className="w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={storeStatusChart}
                      margin={{ top: 8, right: 48, left: 4, bottom: 64 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="storeName"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={72}
                      />
                      <YAxis
                        yAxisId="rev"
                        tick={{ fontSize: 10 }}
                        label={{ value: "萬元", angle: -90, position: "insideLeft", fontSize: 10 }}
                      />
                      <YAxis
                        yAxisId="pct"
                        orientation="right"
                        domain={[0, "auto"]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip content={<StoreStatusTooltip />} />
                      <Legend />
                      <Bar
                        yAxisId="rev"
                        dataKey="revenueWan"
                        name="營收（萬元）"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={36}
                      >
                        {storeStatusChart.map((entry, index) => (
                          <Cell key={`bar-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="pct"
                        type="monotone"
                        dataKey="revenueAchievementRate"
                        name="營收達成率"
                        stroke="#64748b"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#94a3b8", stroke: "#64748b" }}
                        activeDot={{ r: 4, fill: "#94a3b8", stroke: "#475569" }}
                        connectNulls
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              : <p className="text-sm text-slate-500 py-12 text-center">區間無營收資料</p>}
            </div>
          </div>

          {/* 第六層：Top5、Bottom5（各約 55% 原寬）、督導預警加寬 */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5.5fr)_minmax(0,5.5fr)_minmax(0,18fr)] gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">達標 Top 5（營收達成率）</h2>
              <ul className="space-y-2 text-sm">
                {top5.map((s, i) => (
                  <li key={s.storeId} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {s.storeName}
                    </span>
                    <span className="font-medium text-green-700 shrink-0">
                      {formatPctOne(s.revenueAchievementRate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-w-0">
              <h2 className="text-sm font-semibold text-slate-700 mb-2">待改善 Bottom 5</h2>
              <ul className="space-y-2 text-sm">
                {bottom5.map((s, i) => (
                  <li key={s.storeId} className="flex justify-between gap-2">
                    <span>
                      {i + 1}. {s.storeName}
                    </span>
                    <span className="font-medium text-red-600 shrink-0">
                      {formatPctOne(s.revenueAchievementRate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 min-w-0">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                督導高優先預警
              </h2>
              <p className="text-xs text-amber-800/90 mb-3">
                依營收達成率、工效比偏低、總工時偏高綜合排序（相較同區間門市中位數）
              </p>
              {priorityAlerts.length ?
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {priorityAlerts.map((a, i) => (
                    <div
                      key={a.storeId}
                      className="rounded-lg border border-amber-200/70 bg-white overflow-hidden"
                    >
                      <div className="flex items-stretch gap-0">
                        <div className="w-8 shrink-0 flex items-center justify-center bg-amber-100 text-amber-900 text-xs font-bold">
                          {i + 1}
                        </div>
                        <div className="flex-1 px-3 py-2.5 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <Link
                              href={`/operations/analysis?storeId=${encodeURIComponent(a.storeId)}&startDate=${encodeURIComponent(overview.startDate)}&endDate=${encodeURIComponent(overview.endDate)}`}
                              className="font-semibold text-slate-900 hover:text-blue-700"
                            >
                              {a.storeName}
                            </Link>
                            <span className="text-xs text-slate-500">{a.region}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.reasons.map((r) => (
                              <span
                                key={r}
                                className="inline-block rounded-md bg-amber-50 border border-amber-100 px-2 py-0.5 text-xs text-amber-950 leading-snug"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-[11px] text-slate-500 tabular-nums">
                            營收 {formatMoney(a.revenue)} 元
                            {a.revenueAchievementRate != null ?
                              ` · 達成 ${a.revenueAchievementRate.toFixed(1)}%`
                            : ""}
                            {a.efficiencyRatio != null ?
                              ` · 工效 ${Math.round(a.efficiencyRatio).toLocaleString("zh-TW")}`
                            : ""}
                            {a.laborHours > 0 ? ` · 工時 ${a.laborHours.toFixed(1)}h` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              : <p className="text-sm text-slate-600">目前無需優先關注的門市</p>}
            </div>
          </div>
        </>
      : loading ?
        <p className="text-center text-slate-500 py-12">載入中…</p>
      : null}
    </div>
  );
}
