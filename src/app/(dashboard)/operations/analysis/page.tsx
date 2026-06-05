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
import type { OpsDashboardMeta } from "@/types/operations";

const TABS = [
  { id: "overview", label: "門市概況" },
  { id: "trend", label: "趨勢分析" },
  { id: "achievement", label: "達成分析" },
  { id: "regional", label: "區域對標" },
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

const REGION_CHART_COLORS = {
  桃園區: { target: "#93c5fd", actual: "#1e40af" },
  宜蘭區: { target: "#c4b5fd", actual: "#6d28d9" },
} as const;

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

function IconBadge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${className}`}
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
  iconClass,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  iconClass: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <IconBadge className={iconClass}>{icon}</IconBadge>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
          {value}
          <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>
        </p>
      </div>
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
  iconBg,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  iconBg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <IconBadge className={iconBg}>{icon}</IconBadge>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-bold tabular-nums text-slate-800">
          {value}
          <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
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
      {hint ? <p className={`mt-1 text-[10px] ${styles.hint}`}>{hint}</p> : null}
      {storeNames.length > 0 ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-[min(100%,280px)] -translate-x-1/2 rounded-lg border px-3 py-2 text-left text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${styles.pop}`}
        >
          <p className="mb-1 font-semibold">{title}清單</p>
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
  const [perfData, setPerfData] = useState<PerfData | null>(null);

  const [loading, setLoading] = useState(false);
  const [perfLoading, setPerfLoading] = useState(false);
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
  const perfCacheRef = useRef<{ key: string; data: PerfData } | null>(null);

  const queryKey = `${startDate}|${endDate}|${region}|${storeId}`;

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
    perfCacheRef.current = null;
    setPerfData(null);

    const params = new URLSearchParams({
      startDate,
      endDate,
      skipDailyTrend: "0",
      page: "0",
      pageSize: "1",
    });
    if (storeId) params.set("storeId", storeId);
    else if (region) params.set("region", region);

    try {
      const res = await fetch(`/api/operations/dashboard?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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
    } catch {
      setMessage("查詢失敗");
    } finally {
      setLoading(false);
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
    if (!queried || tab === "overview") return;

    if (perfCacheRef.current?.key === queryKey) {
      setPerfData(perfCacheRef.current.data);
      return;
    }

    let cancelled = false;
    setPerfLoading(true);

    void (async () => {
      try {
        const params = new URLSearchParams({ startDate, endDate });
        if (storeId) params.set("storeId", storeId);
        else if (region) params.set("region", region);
        const res = await fetch(`/api/operations/performance-analysis?${params}`);
        if (!res.ok) {
          if (!cancelled) setPerfData(null);
          return;
        }
        const json = (await res.json()) as PerfData;
        if (!cancelled) {
          perfCacheRef.current = { key: queryKey, data: json };
          setPerfData(json);
        }
      } finally {
        if (!cancelled) setPerfLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab, queryKey, queried, startDate, endDate, region, storeId]);

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
    if (!perfData?.regionalBenchmark.length) return [];
    const labels = perfData.regionalBenchmark[0]?.months.map((mo) => mo.label) ?? [];
    return labels.map((label, i) => {
      const row: Record<string, string | number> = { label };
      for (const r of perfData.regionalBenchmark) {
        row[`${r.region}_actual`] = r.months[i]?.actualRevenue ?? 0;
        row[`${r.region}_target`] = r.months[i]?.targetRevenue ?? 0;
      }
      return row;
    });
  }, [perfData]);

  const subtitle =
    queried && m ?
      `${startDate} ~ ${endDate} · ${m.filterLabel}`
    : "篩選日期與門市後按「重新整理」查看績效指標";

  const a = perfData?.achievementSummary;

  return (
    <div className="space-y-5 pb-8 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-6 w-6 text-blue-800" />
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
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-sky-700">全公司營收達成值</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loading ?
              <span className="text-slate-800">{formatMoney(kpiMetrics.totalRevenue)}</span>
            : "—"}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {queried && kpiMetrics?.periodStartDate && kpiMetrics?.periodEndDate ?
              `${kpiMetrics.periodStartDate} ~ ${kpiMetrics.periodEndDate} · ${kpiMetrics.regionLabel ?? "桃園區 + 宜蘭區"}`
            : "宜蘭區 + 桃園區（查詢後顯示）"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-slate-800">營運部工效比</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loading ?
              <span className="text-slate-800">
                {formatRatio(kpiMetrics.efficiencyRatio)}
                <span className="ml-1 text-base font-normal text-slate-500">元/hr</span>
              </span>
            : "—"}
          </p>
          <p className="mt-2 text-xs text-slate-500">營收達成值 ÷ 總工時</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">YoY 營收成長率</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loading ?
              <span
                className={
                  kpiMetrics.yoyGrowthRate != null && kpiMetrics.yoyGrowthRate >= 0 ?
                    "text-emerald-700"
                  : "text-slate-800"
                }
              >
                {formatYoy(kpiMetrics.yoyGrowthRate)}
              </span>
            : "—"}
          </p>
          <p className="mt-2 text-xs text-slate-500">較去年同期</p>
        </div>
      </div>

      {message ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      : null}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id ?
                "border-blue-700 text-blue-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
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
              <TopMetricCard label="營業額" value={formatMoney(m.totalRevenue)} unit="元" icon="💰" iconClass="bg-blue-100 text-blue-600" />
              <TopMetricCard label="工時" value={formatHours(m.totalLaborHours)} unit="hr" icon="⏱" iconClass="bg-emerald-100 text-emerald-600" />
              <TopMetricCard label="工效比" value={formatRatio(m.efficiencyRatio)} unit="元/hr" icon="⚡" iconClass="bg-violet-100 text-violet-600" />
              <TopMetricCard label="月營收目標" value={dashMoney(m.revenueForecast)} unit="元" icon="📈" iconClass="bg-amber-100 text-amber-600" />
              <TopMetricCard label="營收達成值" value={formatMoney(m.revenueAchievement ?? m.totalRevenue)} unit="元" icon="✓" iconClass="bg-teal-100 text-teal-600" />
              <TopMetricCard label="達成率" value={formatPctValue(m.revenueAchievementRate ?? null)} unit="%" icon="%" iconClass="bg-rose-100 text-rose-600" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <IconBadge className="bg-sky-100 text-sky-600">📊</IconBadge>
                <div>
                  <p className="text-sm font-medium text-slate-800">YoY 營收成長率</p>
                  <p className="text-2xl font-bold text-slate-800">{formatYoy(m.yoyGrowthRate ?? null)}</p>
                  <p className="text-xs text-slate-500">較去年同期</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <IconBadge className="bg-indigo-100 text-indigo-600">⏰</IconBadge>
                <div>
                  <p className="text-sm font-medium text-slate-800">門市每日營業時長</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {m.businessHoursLabel ?? dashHours(m.dailyBusinessHours)}
                  </p>
                  <p className="text-xs text-slate-500">週一～五與週六可分別設定</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PanelCard title="工時明細">
                <div className="space-y-3">
                  <MiniStat label="實際出勤總工時" value={formatHours(m.actualAttendanceHours ?? m.totalLaborHours)} unit="hr" icon="👥" iconBg="bg-blue-100 text-blue-600" />
                  <MiniStat label="加班工時" value={dashHours(m.overtimeHours)} unit="hr" icon="⏰" iconBg="bg-red-100 text-red-600" />
                  <MiniStat label="加班時數佔比" value={formatPctValue(m.overtimeRatio ?? null)} unit="%" icon="◐" iconBg="bg-orange-100 text-orange-600" />
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
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-900">
                        請至「門市目標設定」匯入月目標工時；營業時長請至「營運門市管理」設定
                      </p>
                      <Link
                        href="/operations/store-targets"
                        className="mt-2 inline-block rounded-md bg-amber-400 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-500"
                      >
                        前往門市目標設定
                      </Link>
                    </div>
                  : null}
                </div>
              </PanelCard>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <span className="mr-2">💡</span>
              總結：區間內總營業額為 {formatMoney(m.totalRevenue)} 元，總工時為 {formatHours(m.totalLaborHours)} hr，整體工效比為 {formatRatio(m.efficiencyRatio)} 元/hr。
            </div>
          </div>
        : null
      : null}

      {tab === "trend" ?
        perfLoading ?
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
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} />
                    <Tooltip formatter={(v: number) => [formatMoney(v), "營業額"]} />
                    <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#revGradMerged)" strokeWidth={2} />
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
                    <Line type="monotone" dataKey="laborHours" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="月度營收 vs 目標">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perfData?.revenueTrend ?? []}>
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
            </PanelCard>

            <PanelCard title="人均產值趨勢">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={perfData?.productivityTrend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => [`${v} 元/hr`, "人均產值"]} />
                    <Legend />
                    <Line type="monotone" dataKey="perCapita" name="人均產值" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>
      : null}

      {tab === "achievement" ?
        perfLoading ?
          <p className="py-12 text-center text-sm text-slate-500">載入中…</p>
        : !perfData ?
          <p className="py-12 text-center text-sm text-slate-500">請先查詢門市概況</p>
        : <div className="space-y-5">
            {a ?
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-800">營收達成率</h2>
                <p className="mb-4 mt-1 text-xs text-slate-500">
                  區間營收達成情況（{perfData.startDate} ~ {perfData.endDate} · 實際營收 ÷ 業績目標）
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <AchievementBucketCard count={a.green} title="達標" pct={a.greenPct} storeNames={a.achievementStores?.green ?? []} tone="green" />
                  <AchievementBucketCard count={a.yellow} title="接近達標" pct={a.yellowPct} hint="達成率 80%～99%" storeNames={a.achievementStores?.yellow ?? []} tone="amber" />
                  <AchievementBucketCard count={a.red} title="未達標" pct={a.redPct} hint="達成率 < 80%" storeNames={a.achievementStores?.red ?? []} tone="rose" />
                </div>
              </div>
            : null}

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-800">門市排名</h2>
              <p className="mb-3 mt-1 text-xs text-slate-500">
                依區間工效比達標次數（{perfData.startDate} ~ {perfData.endDate}）
              </p>
              <ol className="space-y-2">
                {perfData.storeRanking.map((s, i) => (
                  <li
                    key={s.storeId}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="inline-block w-6 font-medium text-slate-400">{i + 1}</span>
                      {s.storeName}
                      <span className="ml-2 text-xs text-slate-400">{s.region}</span>
                    </span>
                    <span className="font-semibold text-blue-800">{s.targetMetDays} 次</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
      : null}

      {tab === "regional" ?
        perfLoading ?
          <p className="py-12 text-center text-sm text-slate-500">載入中…</p>
        : !perfData ?
          <p className="py-12 text-center text-sm text-slate-500">請先查詢門市概況</p>
        : <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800">區域對標</h2>
            <p className="mb-3 mt-1 text-xs text-slate-500">桃園區 & 宜蘭區 · 月度營收與目標對比</p>
            <div className="h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatWan(Number(v))} />
                  <Tooltip formatter={(v: number) => [`${formatWan(v)} 萬`, ""]} />
                  <Legend />
                  {(["桃園區", "宜蘭區"] as const).flatMap((reg) => {
                    const colors = REGION_CHART_COLORS[reg];
                    if (!perfData.regionalBenchmark.some((r) => r.region === reg)) return [];
                    return [
                      <Bar key={`${reg}-target`} dataKey={`${reg}_target`} name={`${reg} 目標`} fill={colors.target} radius={[4, 4, 0, 0]} />,
                      <Bar key={`${reg}-actual`} dataKey={`${reg}_actual`} name={`${reg} 實際`} fill={colors.actual} radius={[4, 4, 0, 0]} />,
                    ];
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
      : null}
    </div>
  );
}
