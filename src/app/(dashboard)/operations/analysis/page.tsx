"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3 } from "lucide-react";
import {
  Area,
  AreaChart,
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
import { OpsFilterBar } from "@/components/operations/OpsFilterBar";
import { formatLocalDateInput } from "@/lib/date";
import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import { currentMonthStartYmdLocal } from "@/lib/operations-default-dates";
import {
  OPS_COLORS,
  REGION_CHART_COLORS,
  getYoyColor,
  type OpsThemeToken,
} from "@/lib/ops-color-tokens";
import type { OpsDashboardMeta } from "@/types/operations";

const TABS = [
  { id: "overview", label: "門市概況" },
  { id: "trend", label: "趨勢分析" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type DailyTrendPoint = {
  date: string;
  label: string;
  revenue: number;
  laborHours: number;
};

type FilteredMetrics = {
  totalRevenue: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  filterLabel: string;
  revenueForecast?: number | null;
  monthlyLaborHourTarget?: number | null;
  revenueAchievement?: number;
  revenueAchievementRate?: number | null;
  yoyGrowthRate?: number | null;
  actualAttendanceHours?: number;
  overtimeHours?: number | null;
  overtimeRatio?: number | null;
  weekdayBusinessHours?: number | null;
  saturdayBusinessHours?: number | null;
  dailyBusinessHours?: number | null;
  businessHoursLabel?: string;
  defaultLaborHours?: number | null;
  laborHoursDifference?: number | null;
  dailyTrend?: DailyTrendPoint[];
};

type KpiMetrics = {
  totalRevenue: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  yoyGrowthRate: number | null;
  regionLabel?: string;
  periodStartDate?: string;
  periodEndDate?: string;
};

type PerfData = {
  startDate: string;
  endDate: string;
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
    greenPct: number;
    yellowPct: number;
    redPct: number;
    achievementStores: {
      green: string[];
      yellow: string[];
      red: string[];
    };
  };
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatMoney(n: number) {
  return Math.round(n).toLocaleString("zh-TW");
}

function formatHours(n: number) {
  return round2(n).toLocaleString("zh-TW");
}

function formatRatio(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("zh-TW");
}

function formatYoy(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatPctValue(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

function formatWan(n: number) {
  return Math.round(n / 10000).toLocaleString("zh-TW");
}

function formatPctOne(n: number) {
  return `${Number(n).toFixed(1)}%`;
}

function dashHours(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return formatHours(n);
}

function dashMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return formatMoney(n);
}

function IconBadge({
  children,
  iconBg,
  iconColor,
}: {
  children: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
      style={{ backgroundColor: iconBg, color: iconColor }}
    >
      {children}
    </div>
  );
}

function TopMetricCard({
  label,
  value,
  unit,
  icon,
  theme,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  theme: OpsThemeToken;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-4 shadow-sm"
      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
    >
      <IconBadge iconBg={theme.iconBg} iconColor={theme.icon}>
        {icon}
      </IconBadge>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: theme.label }}>
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: theme.value }}>
          {value}
          <span className="ml-1 text-sm font-normal opacity-70">{unit}</span>
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  theme,
  valueColor,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  theme?: OpsThemeToken;
  valueColor?: string;
}) {
  const cardStyle =
    theme ?
      { backgroundColor: theme.bg, borderColor: theme.border }
    : { backgroundColor: "#fff", borderColor: "#e2e8f0" };

  return (
    <div className="rounded-xl border px-5 py-4 shadow-sm" style={cardStyle}>
      <p className="text-sm font-medium" style={{ color: theme?.label ?? "#334155" }}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-slate-400">
        <span style={{ color: valueColor ?? theme?.value ?? "#1e293b" }}>{value}</span>
      </p>
      <p className="mt-2 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function PanelCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  icon,
  theme,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  theme: OpsThemeToken;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border p-3"
      style={{ backgroundColor: theme.bg, borderColor: theme.border }}
    >
      <IconBadge iconBg={theme.iconBg} iconColor={theme.icon}>
        {icon}
      </IconBadge>
      <div>
        <p className="text-xs" style={{ color: theme.label }}>
          {label}
        </p>
        <p className="text-lg font-bold tabular-nums" style={{ color: theme.value }}>
          {value}
          <span className="ml-1 text-xs font-normal opacity-70">{unit}</span>
        </p>
      </div>
    </div>
  );
}

function AchievementBucketCard({
  count,
  title,
  pct,
  hint,
  storeNames,
  tone,
  compact = false,
}: {
  count: number;
  title: string;
  pct: number;
  hint?: string;
  storeNames: string[];
  tone: "met" | "near" | "unmet";
  compact?: boolean;
}) {
  const palette =
    tone === "met" ? OPS_COLORS.status.met
    : tone === "unmet" ? OPS_COLORS.status.unmet
    : OPS_COLORS.achievement;

  const countColor = tone === "near" ? OPS_COLORS.achievement.value : palette.value;
  const titleColor = palette.label;
  const pctColor = palette.value;

  return (
    <div
      className={`group relative rounded-xl border text-center ${compact ? "p-3" : "p-6"}`}
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      <p className={`font-bold ${compact ? "text-2xl" : "text-4xl"}`} style={{ color: countColor }}>
        {count}
      </p>
      <p className={`font-medium ${compact ? "mt-1 text-sm" : "mt-2"}`} style={{ color: titleColor }}>
        {title}
      </p>
      <p className={compact ? "text-xs" : "text-sm"} style={{ color: pctColor }}>
        {formatPctOne(pct)}
      </p>
      {hint ?
        <p className="mt-1 text-[10px] opacity-80" style={{ color: titleColor }}>
          {hint}
        </p>
      : null}
      {storeNames.length > 0 ? (
        <div
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-[min(100%,280px)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-800 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
        >
          <p className="mb-1 font-semibold" style={{ color: titleColor }}>
            {title}清單
          </p>
          <ul className="space-y-0.5">
            {storeNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function OperationsAnalysisPage() {
  const searchParams = useSearchParams();
  const today = formatLocalDateInput();

  const [meta, setMeta] = useState<OpsDashboardMeta | null>(null);
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics | null>(null);
  const [filtered, setFiltered] = useState<FilteredMetrics | null>(null);
  const [companyPerf, setCompanyPerf] = useState<PerfData | null>(null);
  const [storePerf, setStorePerf] = useState<PerfData | null>(null);

  const [loading, setLoading] = useState(false);
  const [companyPerfLoading, setCompanyPerfLoading] = useState(false);
  const [storePerfLoading, setStorePerfLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queried, setQueried] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  const [startDate, setStartDate] = useState(currentMonthStartYmdLocal);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [storeId, setStoreId] = useState("");

  const didInitSelection = useRef(false);
  const didAutoFromUrl = useRef(false);
  const didAutoLoadDefault = useRef(false);
  const companyPerfCacheRef = useRef<{ key: string; data: PerfData } | null>(null);
  const storePerfCacheRef = useRef<{ key: string; data: PerfData } | null>(null);

  const storeQueryKey = `${startDate}|${endDate}|${region}|${storeId}`;

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/operations/dashboard");
    if (res.ok) {
      const data = await res.json();
      setMeta({
        regions: data.meta?.regions ?? [],
        stores: data.meta?.stores ?? [],
      });
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const urlStart = searchParams.get("startDate");
    const urlEnd = searchParams.get("endDate");
    if (urlStart) setStartDate(urlStart);
    if (urlEnd) setEndDate(urlEnd);
  }, [searchParams]);

  useEffect(() => {
    if (!meta?.stores.length) return;
    const urlStore = searchParams.get("storeId") || searchParams.get("store");
    if (urlStore && meta.stores.some((s) => s.id === urlStore)) {
      const picked = meta.stores.find((s) => s.id === urlStore)!;
      setStoreId(picked.id);
      if (picked.region) setRegion(picked.region);
      return;
    }
    if (!didInitSelection.current) {
      didInitSelection.current = true;
      const first = meta.stores[0];
      setStoreId(first.id);
      if (first.region) setRegion(first.region);
    }
  }, [meta, searchParams]);

  const regionOptions = useMemo(() => {
    const fromApi = meta?.regions ?? [];
    if (fromApi.length >= OPS_FILTER_REGIONS.length) return fromApi;
    return [...OPS_FILTER_REGIONS];
  }, [meta?.regions]);

  const handleRefresh = useCallback(async () => {
    setMessage(null);
    if (!startDate || !endDate || startDate > endDate) return;

    setLoading(true);
    setQueried(true);
    setFiltered(null);
    setKpiMetrics(null);
    companyPerfCacheRef.current = null;
    storePerfCacheRef.current = null;
    setCompanyPerf(null);
    setStorePerf(null);

    const params = new URLSearchParams({
      startDate,
      endDate,
      skipDailyTrend: "0",
      page: "0",
      pageSize: "1",
    });
    if (storeId) params.set("storeId", storeId);
    else if (region) params.set("region", region);

    const companyKey = `${startDate}|${endDate}`;
    setCompanyPerfLoading(true);

    try {
      const [dashRes, companyRes] = await Promise.all([
        fetch(`/api/operations/dashboard?${params}`),
        fetch(
          `/api/operations/performance-analysis?${new URLSearchParams({ startDate, endDate })}`
        ),
      ]);
      const data = await dashRes.json().catch(() => ({}));
      if (!dashRes.ok) {
        setMessage(data.error || "查詢失敗");
        return;
      }
      if (data.meta?.stores) {
        setMeta({
          regions: data.meta.regions ?? [],
          stores: data.meta.stores ?? [],
        });
      }
      setKpiMetrics(data.kpiMetrics ?? null);
      setFiltered(data.filteredMetrics ?? null);

      if (companyRes.ok) {
        const companyJson = (await companyRes.json()) as PerfData;
        companyPerfCacheRef.current = { key: companyKey, data: companyJson };
        setCompanyPerf(companyJson);
      } else {
        setCompanyPerf(null);
      }
    } catch {
      setMessage("查詢失敗");
    } finally {
      setLoading(false);
      setCompanyPerfLoading(false);
    }
  }, [startDate, endDate, region, storeId]);

  useEffect(() => {
    const urlStore = searchParams.get("storeId") || searchParams.get("store");
    if (didAutoFromUrl.current || !urlStore || !meta?.stores.length) return;
    if (storeId !== urlStore || !startDate || !endDate) return;
    didAutoFromUrl.current = true;
    void handleRefresh();
  }, [storeId, startDate, endDate, meta, searchParams, handleRefresh]);

  useEffect(() => {
    if (didAutoLoadDefault.current || didAutoFromUrl.current || !meta?.stores.length || !storeId) {
      return;
    }
    didAutoLoadDefault.current = true;
    void handleRefresh();
  }, [meta, storeId, startDate, endDate, handleRefresh]);

  useEffect(() => {
    if (!queried || tab !== "trend") return;

    if (storePerfCacheRef.current?.key === storeQueryKey) {
      setStorePerf(storePerfCacheRef.current.data);
      return;
    }

    let cancelled = false;
    setStorePerfLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({ startDate, endDate });
        if (storeId) params.set("storeId", storeId);
        else if (region) params.set("region", region);
        const res = await fetch(`/api/operations/performance-analysis?${params}`);
        if (!res.ok) {
          if (!cancelled) setStorePerf(null);
          return;
        }
        const json = (await res.json()) as PerfData;
        if (!cancelled) {
          storePerfCacheRef.current = { key: storeQueryKey, data: json };
          setStorePerf(json);
        }
      } finally {
        if (!cancelled) setStorePerfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, storeQueryKey, queried, startDate, endDate, region, storeId]);

  async function handleSyncStores() {
    setSyncing(true);
    await fetch("/api/operations/stores/sync", { method: "POST" });
    setSyncing(false);
    await loadMeta();
  }

  const m = filtered;
  const hasLaborTarget =
    m?.defaultLaborHours != null || m?.monthlyLaborHourTarget != null;
  const chartData = m?.dailyTrend ?? [];

  const regionalChartData = useMemo(() => {
    if (!companyPerf?.regionalBenchmark.length) return [];
    const labels = companyPerf.regionalBenchmark[0]?.months.map((mo) => mo.label) ?? [];
    return labels.map((label, i) => {
      const row: Record<string, string | number> = { label };
      for (const r of companyPerf.regionalBenchmark) {
        row[`${r.region}_actual`] = r.months[i]?.actualRevenue ?? 0;
        row[`${r.region}_target`] = r.months[i]?.targetRevenue ?? 0;
      }
      return row;
    });
  }, [companyPerf]);

  const subtitle =
    queried && m ?
      `${startDate} ~ ${endDate} · ${m.filterLabel}`
    : "篩選日期與門市後按「重新整理」查看績效指標";

  const a = companyPerf?.achievementSummary;

  return (
    <div className="space-y-5 pb-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-6 w-6" style={{ color: OPS_COLORS.revenue.value }} />
            績效 & 業績分析
          </h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/operations/store-targets"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            門市目標設定
          </Link>
          <button
            type="button"
            onClick={() => void handleSyncStores()}
            disabled={syncing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {syncing ? "同步中…" : "同步門市"}
          </button>
        </div>
      </div>

      <OpsFilterBar
        startDate={startDate}
        endDate={endDate}
        region={region}
        storeId={storeId}
        stores={meta?.stores ?? []}
        regionOptions={regionOptions}
        loading={loading}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onRegionChange={(newRegion, firstStoreId) => {
          setRegion(newRegion);
          setStoreId(newRegion ? firstStoreId : "");
        }}
        onStoreIdChange={setStoreId}
        onRefresh={() => void handleRefresh()}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="全公司營收達成值"
          theme={OPS_COLORS.revenue}
          value={queried && kpiMetrics && !loading ? formatMoney(kpiMetrics.totalRevenue) : "—"}
          sub={
            queried && kpiMetrics?.periodStartDate && kpiMetrics?.periodEndDate ?
              `${kpiMetrics.periodStartDate} ~ ${kpiMetrics.periodEndDate} · ${kpiMetrics.regionLabel ?? "桃園區 + 宜蘭區"}`
            : "宜蘭區 + 桃園區（查詢後顯示）"
          }
        />
        <KpiCard
          label="營運部工效比"
          theme={OPS_COLORS.hours}
          value={
            queried && kpiMetrics && !loading ?
              <>
                {formatRatio(kpiMetrics.efficiencyRatio)}
                <span className="ml-1 text-base font-normal opacity-70">元/hr</span>
              </>
            : "—"
          }
          sub="營收達成值 ÷ 總工時"
        />
        <KpiCard
          label="營收成長率"
          value={queried && kpiMetrics && !loading ? formatYoy(kpiMetrics.yoyGrowthRate) : "—"}
          valueColor={
            queried && kpiMetrics && !loading ?
              getYoyColor(kpiMetrics.yoyGrowthRate)
            : OPS_COLORS.yoy.neutral
          }
          sub="較去年同期"
        />
      </div>

      {message ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      : null}

      {queried ?
        <div className="space-y-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            全區視角 · 桃園區 + 宜蘭區
          </p>

          {companyPerfLoading || loading ?
            <p className="py-6 text-center text-sm text-slate-500">載入全區數據中…</p>
          : !companyPerf ?
            <p className="py-6 text-center text-sm text-slate-500">全區數據載入失敗，請重新整理</p>
          : <>
              {a ?
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-800">達成分析</h2>
                      <p className="mb-3 mt-1 text-xs text-slate-500">
                        區間營收達成情況（{companyPerf.startDate} ~ {companyPerf.endDate} · 桃園區 + 宜蘭區全門市 · 實際營收 ÷ 業績目標）
                      </p>
                      <div className="grid max-w-md grid-cols-3 gap-2">
                        <AchievementBucketCard compact count={a.green} title="達標" pct={a.greenPct} storeNames={a.achievementStores?.green ?? []} tone="met" />
                        <AchievementBucketCard compact count={a.yellow} title="接近達標" pct={a.yellowPct} hint="達成率 80%～99%" storeNames={a.achievementStores?.yellow ?? []} tone="near" />
                        <AchievementBucketCard compact count={a.red} title="未達標" pct={a.redPct} hint="達成率 < 80%" storeNames={a.achievementStores?.red ?? []} tone="unmet" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-slate-800">區域對標</h2>
                      <p className="mb-3 mt-1 text-xs text-slate-500">
                        桃園區 & 宜蘭區 · 月度營收與目標對比（{companyPerf.startDate} ~ {companyPerf.endDate}）
                      </p>
                      <div className="h-[200px] w-full min-w-0 lg:h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={regionalChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                            <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                            <Legend />
                            {(["桃園區", "宜蘭區"] as const).flatMap((reg) => {
                              const colors = REGION_CHART_COLORS[reg];
                              if (!companyPerf.regionalBenchmark.some((r) => r.region === reg)) return [];
                              return [
                                <Bar key={`${reg}-target`} dataKey={`${reg}_target`} name={`${reg} 目標`} fill={colors.target} radius={[4, 4, 0, 0]} />,
                                <Bar key={`${reg}-actual`} dataKey={`${reg}_actual`} name={`${reg} 實際`} fill={colors.actual} radius={[4, 4, 0, 0]} />,
                              ];
                            })}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              : null}

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800">門市排名</h2>
                <p className="mb-3 mt-1 text-xs text-slate-500">
                  依區間工效比達標次數（{companyPerf.startDate} ~ {companyPerf.endDate} · 桃園區 + 宜蘭區全門市）
                </p>
                <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {companyPerf.storeRanking.map((s, i) => (
                    <li
                      key={s.storeId}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="inline-block w-6 font-medium text-slate-400">{i + 1}</span>
                        {s.storeName}
                        <span className="ml-1 text-xs text-slate-400">{s.region}</span>
                      </span>
                      <span className="ml-2 shrink-0 font-semibold" style={{ color: OPS_COLORS.hours.label }}>
                        {s.targetMetDays} 次
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          }
        </div>
      : null}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors border-transparent text-slate-500 hover:text-slate-700"
            style={
              tab === t.id ?
                { borderColor: OPS_COLORS.revenue.value, color: OPS_COLORS.revenue.value }
              : undefined
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ?
        !queried || loading ?
          <p className="py-12 text-center text-sm text-slate-500">
            {loading ? "載入中…" : "請選擇門市後再查詢"}
          </p>
        : m ?
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <TopMetricCard label="營業額" value={formatMoney(m.totalRevenue)} unit="元" icon="💰" theme={OPS_COLORS.revenue} />
              <TopMetricCard label="工時" value={formatHours(m.totalLaborHours)} unit="hr" icon="⏱" theme={OPS_COLORS.hours} />
              <TopMetricCard label="工效比" value={formatRatio(m.efficiencyRatio)} unit="元/hr" icon="⚡" theme={OPS_COLORS.hours} />
              <TopMetricCard label="月營收目標" value={dashMoney(m.revenueForecast)} unit="元" icon="📈" theme={OPS_COLORS.achievement} />
              <TopMetricCard label="營收達成值" value={formatMoney(m.revenueAchievement ?? m.totalRevenue)} unit="元" icon="✓" theme={OPS_COLORS.revenue} />
              <TopMetricCard label="達成率" value={formatPctValue(m.revenueAchievementRate ?? null)} unit="%" icon="%" theme={OPS_COLORS.achievement} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div
                className="flex items-center gap-4 rounded-xl border bg-white p-4 shadow-sm"
                style={{ borderColor: "#e2e8f0" }}
              >
                <IconBadge iconBg="#F1EFE8" iconColor={OPS_COLORS.yoy.neutral}>
                  📊
                </IconBadge>
                <div>
                  <p className="text-sm font-medium text-slate-800">營收成長率</p>
                  <p
                    className="text-2xl font-bold"
                    style={{ color: getYoyColor(m.yoyGrowthRate ?? null) }}
                  >
                    {formatYoy(m.yoyGrowthRate ?? null)}
                  </p>
                  <p className="text-xs text-slate-500">較去年同期</p>
                </div>
              </div>
              <div
                className="flex items-center gap-4 rounded-xl border p-4 shadow-sm"
                style={{
                  backgroundColor: OPS_COLORS.hours.bg,
                  borderColor: OPS_COLORS.hours.border,
                }}
              >
                <IconBadge iconBg={OPS_COLORS.hours.iconBg} iconColor={OPS_COLORS.hours.icon}>
                  ⏰
                </IconBadge>
                <div>
                  <p className="text-sm font-medium" style={{ color: OPS_COLORS.hours.label }}>
                    門市每日營業時長
                  </p>
                  <p className="text-2xl font-bold" style={{ color: OPS_COLORS.hours.value }}>
                    {m.businessHoursLabel ?? dashHours(m.dailyBusinessHours)}
                  </p>
                  <p className="text-xs opacity-70" style={{ color: OPS_COLORS.hours.label }}>
                    週一～五與週六可分別設定
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PanelCard title="工時明細">
                <div className="space-y-3">
                  <MiniStat label="實際出勤總工時" value={formatHours(m.actualAttendanceHours ?? m.totalLaborHours)} unit="hr" icon="👥" theme={OPS_COLORS.hours} />
                  <MiniStat
                    label="加班工時"
                    value={dashHours(m.overtimeHours)}
                    unit="hr"
                    icon="⏰"
                    theme={{ ...OPS_COLORS.hours, value: OPS_COLORS.hours.chartDeep, icon: OPS_COLORS.hours.chartDeep }}
                  />
                  <MiniStat label="加班時數佔比" value={formatPctValue(m.overtimeRatio ?? null)} unit="%" icon="◐" theme={OPS_COLORS.achievement} />
                </div>
              </PanelCard>

              <PanelCard title="預設工時比較">
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-xs text-slate-500">單月目標總工時</p>
                    <p className="text-lg font-bold text-slate-800">
                      {dashHours(m.monthlyLaborHourTarget)}
                      <span className="ml-1 text-xs font-normal text-slate-500">hr</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-xs text-slate-500">區間目標工時合計</p>
                    <p className="text-lg font-bold text-slate-800">
                      {dashHours(m.defaultLaborHours)}
                      <span className="ml-1 text-xs font-normal text-slate-500">hr</span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-xs text-slate-500">工時差異</p>
                    <p className="text-lg font-bold text-slate-800">
                      {dashHours(m.laborHoursDifference)}
                      <span className="ml-1 text-xs font-normal text-slate-500">hr</span>
                    </p>
                  </div>
                  {!hasLaborTarget ?
                    <div
                      className="rounded-lg border p-3"
                      style={{
                        backgroundColor: OPS_COLORS.achievement.bg,
                        borderColor: OPS_COLORS.achievement.border,
                      }}
                    >
                      <p className="text-xs" style={{ color: OPS_COLORS.achievement.value }}>
                        請至「門市目標設定」匯入月業績目標與依人力計算工時；營業時長請至「營運門市管理」設定
                      </p>
                      <Link
                        href="/operations/store-targets"
                        className="mt-2 inline-block rounded-md px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                        style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
                      >
                        前往門市目標設定
                      </Link>
                    </div>
                  : null}
                </div>
              </PanelCard>
            </div>

            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                backgroundColor: OPS_COLORS.revenue.bg,
                borderColor: OPS_COLORS.revenue.border,
                color: OPS_COLORS.revenue.value,
              }}
            >
              <span className="mr-2">💡</span>
              總結：區間內總營業額為 {formatMoney(m.totalRevenue)} 元，總工時為 {formatHours(m.totalLaborHours)} hr，整體工效比為 {formatRatio(m.efficiencyRatio)} 元/hr。
            </div>
          </div>
        : null
      : null}

      {tab === "trend" ?
        storePerfLoading ?
          <p className="py-12 text-center text-sm text-slate-500">載入中…</p>
        : !queried || !m ?
          <p className="py-12 text-center text-sm text-slate-500">請先查詢門市概況</p>
        : <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard title="每日營業額">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="revGradMerged" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={OPS_COLORS.revenue.chart} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={OPS_COLORS.revenue.chart} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} />
                    <Tooltip formatter={(v: number) => [formatMoney(v), "營業額"]} />
                    <Area type="monotone" dataKey="revenue" stroke={OPS_COLORS.revenue.chart} fill="url(#revGradMerged)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="每日工時">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [formatHours(v), "工時"]} />
                    <Line type="monotone" dataKey="laborHours" stroke={OPS_COLORS.hours.chart} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="月度營收 vs 目標">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={storePerf?.revenueTrend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                    <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                    <Legend />
                    <Bar dataKey="targetRevenue" name="目標營收" fill={OPS_COLORS.revenue.chartMute} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actualRevenue" name="實際營收" fill={OPS_COLORS.revenue.chart} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="人均產值趨勢">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={storePerf?.productivityTrend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} 元/hr`, "人均產值"]} />
                    <Legend />
                    <Line type="monotone" dataKey="perCapita" name="人均產值" stroke={OPS_COLORS.hours.chart} strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>
      : null}

    </div>
  );
}
