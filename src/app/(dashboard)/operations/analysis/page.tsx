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
import { DUAL_OPS_REGIONS, OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import { currentMonthStartYmdLocal } from "@/lib/operations-default-dates";
import {
  OPS_COLORS,
  getYoyColor,
  type OpsThemeToken,
} from "@/lib/ops-color-tokens";
import type { OpsDashboardMeta } from "@/types/operations";

const TABS = [
  { id: "overview", label: "門市概況" },
  { id: "trend", label: "趨勢分析" },
  { id: "calendar", label: "門市日曆" },
] as const;

type TabId = (typeof TABS)[number]["id"];

type CalendarStaff = {
  name: string;
  workHours: number;
  homeStore: string | null;
  isSupport: boolean;
  outgoingTo: string | null;
  newHireLabel?: string | null;
  temporaryLabel?: string | null;
};

type CalendarDeduction = {
  label: string;
  hours: number;
  note?: string | null;
  isPositive?: boolean;
};

type CalendarDay = {
  date: string;
  weekday: number;
  holiday: string | null;
  staff: CalendarStaff[];
  deductions: CalendarDeduction[];
  efficiencyRatio: number | null;
  isAchieved: boolean;
  isExceed: boolean;
  hasData: boolean;
  netHours: number;
  revenue: number;
};

type CalendarData = {
  storeName: string;
  days: CalendarDay[];
  employeeAchievement: {
    name: string;
    homeStore: string | null;
    isSupport: boolean;
    attendanceDays: number;
    achievedDays: number;
    exceedDays: number;
    achieveRate: number;
  }[];
};

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
  scheduledHours?: number | null;
  overtimeHours?: number | null;
  overtimeRatio?: number | null;
  weekdayBusinessHours?: number | null;
  saturdayBusinessHours?: number | null;
  dailyBusinessHours?: number | null;
  businessHoursLabel?: string;
  defaultLaborHours?: number | null;
  laborHoursDifference?: number | null;
  dailyTrend?: DailyTrendPoint[];
  customerCount?: number;
  avgOrderValue?: number | null;
  customerDaysWithData?: number;
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


export default function OperationsAnalysisPage({ fixedRegion }: { fixedRegion?: string } = {}) {
  const searchParams = useSearchParams();
  const today = formatLocalDateInput();

  const [meta, setMeta] = useState<OpsDashboardMeta | null>(null);
  const [filtered, setFiltered] = useState<FilteredMetrics | null>(null);
  const [companyPerf, setCompanyPerf] = useState<PerfData | null>(null);
  const [storePerf, setStorePerf] = useState<PerfData | null>(null);
  const [calData, setCalData] = useState<CalendarData | null>(null);

  const [loading, setLoading] = useState(false);
  const [companyPerfLoading, setCompanyPerfLoading] = useState(false);
  const [storePerfLoading, setStorePerfLoading] = useState(false);
  const [calLoading, setCalLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queried, setQueried] = useState(false);
  const [tab, setTab] = useState<TabId>("overview");

  const [startDate, setStartDate] = useState(currentMonthStartYmdLocal);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState(fixedRegion ?? "");
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
      const first = fixedRegion
        ? (meta.stores.find((s) => s.region === fixedRegion) ?? meta.stores[0])
        : meta.stores[0];
      setStoreId(first.id);
      if (first.region) setRegion(fixedRegion ?? first.region);
    }
  }, [meta, searchParams, fixedRegion]);

  const regionOptions = useMemo(() => {
    if (fixedRegion) return [fixedRegion];
    const opsRegions = DUAL_OPS_REGIONS as readonly string[];
    const fromApi = (meta?.regions ?? []).filter((r) => opsRegions.includes(r));
    if (fromApi.length >= OPS_FILTER_REGIONS.length) return fromApi;
    return OPS_FILTER_REGIONS.filter((r) => r !== "台北區");
  }, [meta?.regions, fixedRegion]);

  const handleRefresh = useCallback(async () => {
    setMessage(null);
    if (!startDate || !endDate || startDate > endDate) return;

    setLoading(true);
    setQueried(true);
    setFiltered(null);
    setCalData(null);
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

  const loadCalendar = useCallback(async () => {
    if (!storeId) { setCalData(null); return; }
    const year = parseInt(startDate.slice(0, 4), 10);
    const month = parseInt(startDate.slice(5, 7), 10);
    setCalLoading(true);
    try {
      const params = new URLSearchParams({ storeId, year: String(year), month: String(month) });
      const res = await fetch(`/api/operations/work-hours/calendar?${params}`);
      if (res.ok) setCalData(await res.json());
      else setCalData(null);
    } finally {
      setCalLoading(false);
    }
  }, [storeId, startDate]);

  useEffect(() => {
    if (!queried || tab !== "calendar") return;
    void loadCalendar();
  }, [tab, queried, loadCalendar]);

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

  const subtitle =
    queried && m ?
      `${startDate} ~ ${endDate} · ${m.filterLabel}`
    : "篩選日期與門市後按「重新整理」查看績效指標";

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
        fixedRegion={fixedRegion}
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

      {/* 第一層：依篩選區域/門市 + 日期區間 */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="營收目標值"
          theme={OPS_COLORS.achievement}
          value={queried && m && !loading ? formatMoney(m.revenueForecast ?? 0) : "—"}
          sub={queried && m ? m.filterLabel : "查詢後顯示"}
        />
        <KpiCard
          label="營收達成值"
          theme={OPS_COLORS.revenue}
          value={queried && m && !loading ? formatMoney(m.revenueAchievement ?? m.totalRevenue) : "—"}
          sub={queried && m ? m.filterLabel : "查詢後顯示"}
        />
        <KpiCard
          label="達成率"
          theme={OPS_COLORS.achievement}
          value={
            queried && m && !loading ?
              (m.revenueAchievementRate != null ? `${Number(m.revenueAchievementRate).toFixed(1)}%` : "—")
            : "—"
          }
          sub="營收達成值 ÷ 目標值"
        />
        <KpiCard
          label="成長率"
          value={queried && m && !loading ? formatYoy(m.yoyGrowthRate ?? null) : "—"}
          valueColor={
            queried && m && !loading ?
              getYoyColor(m.yoyGrowthRate ?? null)
            : OPS_COLORS.yoy.neutral
          }
          sub="較去年同期"
        />
        <KpiCard
          label="工效比"
          theme={OPS_COLORS.hours}
          value={queried && m && !loading ? formatRatio(m.efficiencyRatio) : "—"}
          sub="元 / hr"
        />
        <KpiCard
          label="來客數"
          theme={OPS_COLORS.customer}
          value={
            queried && m && !loading && (m.customerCount ?? 0) > 0 ?
              (m.customerCount ?? 0).toLocaleString("zh-TW")
            : "—"
          }
          sub={
            queried && m && !loading ?
              (m.customerDaysWithData ? `區間 ${m.customerDaysWithData} 天有資料` : "請上傳來客數資料")
            : "查詢後顯示"
          }
        />
        <KpiCard
          label="平均客單價"
          theme={OPS_COLORS.customer}
          value={
            queried && m && !loading && m.avgOrderValue != null ?
              `${formatMoney(m.avgOrderValue)} 元`
            : "—"
          }
          sub="銷售總額 ÷ 來客數"
        />
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

            {/* 工時四指標卡 */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(
                [
                  { label: "表訂工時", value: m.scheduledHours, sub: "出勤紀錄 F 欄加總", color: "bg-slate-50 border-slate-200" },
                  { label: "實際出勤工時", value: m.actualAttendanceHours ?? m.totalLaborHours, sub: "G─H 欄打卡工時", color: "bg-slate-50 border-slate-200" },
                  { label: "加班工時", value: m.overtimeHours, sub: "實際超出表訂累積", color: "bg-amber-50 border-amber-200", textColor: "text-amber-900", subColor: "text-amber-700" },
                  { label: "目標工時（人力）", value: m.defaultLaborHours, sub: "門市人力規劃設定", color: "bg-blue-50 border-blue-200", textColor: "text-blue-900", subColor: "text-blue-700" },
                ] as { label: string; value: number | null | undefined; sub: string; color: string; textColor?: string; subColor?: string }[]
              ).map((card) => (
                <div key={card.label} className={`rounded-xl border p-3 ${card.color}`}>
                  <p className={`text-xs ${card.subColor ?? "text-slate-500"}`}>{card.label}</p>
                  <p className={`mt-1 text-xl font-bold ${card.textColor ?? "text-slate-800"}`}>
                    {card.value != null ? `${Math.round(card.value * 10) / 10}` : "—"}
                    <span className="ml-1 text-xs font-normal opacity-70">hr</span>
                  </p>
                  <p className={`mt-0.5 text-[11px] ${card.subColor ?? "text-slate-400"}`}>{card.sub}</p>
                </div>
              ))}
            </div>

            {/* 三條基準線對比 + 差距分析 */}
            <div className="grid gap-4 lg:grid-cols-2">
              <PanelCard title="三條基準線對比">
                {(() => {
                  const target = m.defaultLaborHours ?? 0;
                  const actual = m.actualAttendanceHours ?? m.totalLaborHours ?? 0;
                  const scheduled = m.scheduledHours ?? 0;
                  const max = Math.max(target, actual, scheduled, 1);
                  const rows = [
                    { label: "目標工時", val: target, pct: target / max, color: "#3b82f6", tag: "人力規劃", tagCls: "bg-blue-100 text-blue-800" },
                    { label: "實際出勤", val: actual, pct: actual / max, color: "#6b7280", tag: target > 0 ? `${actual > target ? "+" : ""}${Math.round((actual - target) * 10) / 10}h vs 目標` : null, tagCls: "bg-slate-100 text-slate-600" },
                    { label: "表訂工時", val: scheduled, pct: scheduled / max, color: "#10b981", tag: scheduled > 0 && actual > scheduled ? `+${Math.round((actual - scheduled) * 10) / 10}h 加班補` : scheduled > 0 && actual < scheduled ? `-${Math.round((scheduled - actual) * 10) / 10}h 未滿排` : null, tagCls: "bg-amber-100 text-amber-800" },
                  ];
                  return (
                    <div className="space-y-3">
                      {rows.map((r) => (
                        <div key={r.label} className="flex items-center gap-2">
                          <span className="w-16 flex-shrink-0 text-xs text-slate-500">{r.label}</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 8 }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.round(r.pct * 100)}%`, background: r.color }} />
                          </div>
                          <span className="w-12 flex-shrink-0 text-right text-xs font-medium text-slate-700">{Math.round(r.val)}</span>
                          {r.tag ?
                            <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] ${r.tagCls}`}>{r.tag}</span>
                          : <span className="w-20 flex-shrink-0" />}
                        </div>
                      ))}
                      {!hasLaborTarget ?
                        <div className="rounded-lg border p-2 text-[11px]" style={{ backgroundColor: OPS_COLORS.achievement.bg, borderColor: OPS_COLORS.achievement.border, color: OPS_COLORS.achievement.value }}>
                          請至「門市目標設定」設定人力工時目標
                          <Link href="/operations/store-targets" className="ml-2 underline">前往設定</Link>
                        </div>
                      : null}
                    </div>
                  );
                })()}
              </PanelCard>

              <PanelCard title="工時差距分析">
                {(() => {
                  const target = m.defaultLaborHours;
                  const actual = m.actualAttendanceHours ?? m.totalLaborHours ?? 0;
                  const scheduled = m.scheduledHours;
                  const diffActualScheduled = scheduled != null ? Math.round((actual - scheduled) * 10) / 10 : null;
                  const diffActualTarget = target != null ? Math.round((actual - target) * 10) / 10 : null;
                  const diffScheduledTarget = scheduled != null && target != null ? Math.round((scheduled - target) * 10) / 10 : null;
                  const gap = (label: string, diff: number | null, positiveLabel: string, negativeLabel: string) => (
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="text-xs text-slate-500">{label}</span>
                      {diff != null ?
                        <span className={`text-xs font-medium ${diff > 0 ? "text-red-700" : diff < 0 ? "text-emerald-700" : "text-slate-600"}`}>
                          {diff > 0 ? `+${diff}h` : `${diff}h`}
                          <span className="ml-1 font-normal opacity-70">（{diff > 0 ? positiveLabel : diff < 0 ? negativeLabel : "持平"}）</span>
                        </span>
                      : <span className="text-xs text-slate-400">—</span>}
                    </div>
                  );
                  return (
                    <div className="space-y-2">
                      {gap("實際 vs 表訂", diffActualScheduled, "超排→加班", "未滿排")}
                      {gap("實際 vs 目標", diffActualTarget, "超出人力目標", "人力不足")}
                      {gap("表訂 vs 目標", diffScheduledTarget, "超出目標排班", "排班規劃缺口")}
                      {diffActualScheduled != null && diffActualTarget != null && diffScheduledTarget != null ?
                        <p className="pt-1 text-[11px] text-slate-400">
                          排班缺口 {Math.abs(diffScheduledTarget)}h → 加班補 {Math.max(0, diffActualScheduled)}h → 仍{diffActualTarget < 0 ? `缺 ${Math.abs(diffActualTarget)}h` : `超出 ${diffActualTarget}h`}
                        </p>
                      : null}
                    </div>
                  );
                })()}
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

      {tab === "calendar" ?
        !queried ?
          <p className="py-12 text-center text-sm text-slate-500">請先查詢後再查看門市日曆</p>
        : !storeId ?
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
            請在上方篩選器選擇單一門市，即可查看該門市的月曆出勤與達標紀錄。
          </div>
        : calLoading ?
          <p className="py-12 text-center text-sm text-slate-500">載入日曆中…</p>
        : !calData ?
          <div className="text-center py-16">
            <p className="text-sm text-slate-500 mb-3">尚未載入日曆資料</p>
            <button
              type="button"
              onClick={() => void loadCalendar()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              載入日曆
            </button>
          </div>
        : <>
            <AnalysisCalendarView data={calData} />
            {companyPerf && !companyPerfLoading ?
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
            : null}
          </>
      : null}

    </div>
  );
}

const CAL_DOW_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function AnalysisCalendarView({ data }: { data: CalendarData }) {
  const todayYmd = new Date().toISOString().slice(0, 10);
  const firstDay = data.days[0];
  const leadingEmpties = firstDay ? firstDay.weekday : 0;
  const dayNumbers = data.days.map((d) => parseInt(d.date.slice(8), 10));
  const dayMap = new Map(data.days.map((d) => [d.date, d]));

  return (
    <div className="space-y-6">
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-amber-800 rounded-xl border border-slate-100 bg-amber-50 px-3 py-2">
        <span>達標條件：平日工效比 ≥ 4,000 元/hr、週六 ≥ 5,500 元/hr</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-400" />本店人員
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />調入（他店來支援）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />調出（去他店支援）
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div style={{ minWidth: 0, maxWidth: "100%" }}>
          <div className="grid grid-cols-7 border-b border-slate-100">
            {CAL_DOW_LABELS.map((d, i) => (
              <div
                key={d}
                className={`py-2 text-center text-sm font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-600"}`}
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px] bg-slate-100 p-[3px]">
            {Array.from({ length: leadingEmpties }).map((_, i) => (
              <div key={`b${i}`} className="min-h-24 bg-slate-50/50" />
            ))}
            {dayNumbers.map((dom) => {
              const ymd = `${String(data.days[0]?.date.slice(0, 7))}-${String(dom).padStart(2, "0")}`;
              const day = dayMap.get(ymd);
              const isSun = (leadingEmpties + dom - 1) % 7 === 0;
              const isSat = (leadingEmpties + dom - 1) % 7 === 6;
              const isToday = ymd === todayYmd;
              const isFuture = ymd > todayYmd;
              const isHoliday = !!day?.holiday;
              const isRest = isSun || isHoliday;

              let cellCls = "min-h-28 p-1.5 rounded-sm border ";
              if (isRest) cellCls += "bg-slate-50/70 border-slate-200 ";
              else if (isFuture) cellCls += "bg-white opacity-50 border-slate-200 ";
              else if (day?.isExceed) cellCls += "bg-purple-50 border-purple-300 ";
              else if (day?.isAchieved) cellCls += "bg-emerald-50 border-emerald-300 ";
              else if (day?.hasData) cellCls += "bg-white border-red-300 ";
              else cellCls += "bg-white border-slate-200 ";

              const borderStyle: React.CSSProperties = isToday
                ? { outline: "2px solid #93c5fd", outlineOffset: "-2px" }
                : {};

              const tag =
                !isRest && !isFuture && day?.hasData
                  ? day.isExceed
                    ? { label: "超標", cls: "bg-purple-100 text-purple-700" }
                    : day.isAchieved
                    ? { label: "達標", cls: "bg-emerald-100 text-emerald-700" }
                    : { label: "未達", cls: "bg-red-100 text-red-600" }
                  : null;

              const maxStaff = 8;

              return (
                <div key={dom} className={cellCls} style={borderStyle}>
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-xs font-medium ${
                        isSun || isHoliday ? "text-red-400"
                        : isSat ? "text-blue-400"
                        : isToday ? "text-blue-600"
                        : "text-slate-500"
                      }`}
                    >
                      {dom}
                    </span>
                    {tag && (
                      <span className={`rounded px-1.5 py-px text-[10px] font-medium ${tag.cls}`}>
                        {tag.label}
                      </span>
                    )}
                  </div>
                  {!isRest && !isFuture && day?.hasData && (
                    <div
                      className="mb-1.5 pb-1.5 text-[11px] font-medium"
                      style={{
                        borderBottom: "0.5px solid rgba(0,0,0,0.07)",
                        color: day.isExceed ? "#5b21b6" : day.isAchieved ? "#085041" : "#475569",
                      }}
                    >
                      {day.netHours.toFixed(1)}h &nbsp;／&nbsp; ${day.revenue >= 10000 ? `${(day.revenue / 10000).toFixed(1)}萬` : day.revenue.toLocaleString()}
                    </div>
                  )}
                  {!isRest && !isFuture && (
                    <>
                      {(day?.staff ?? []).slice(0, maxStaff).map((s, si) => (
                        <div key={si} className="flex items-start gap-1 mb-1">
                          <span className={`inline-block mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${s.outgoingTo ? "bg-indigo-500" : s.isSupport ? "bg-amber-400" : "bg-teal-400"}`} />
                          <span className="text-[11px] leading-tight text-slate-700">
                            {s.name}
                            <span className="text-slate-400 ml-0.5">{s.workHours.toFixed(1)}h</span>
                            {s.outgoingTo ? (
                              <span className="text-indigo-500 ml-0.5">→ {s.outgoingTo}</span>
                            ) : s.isSupport && s.homeStore ? (
                              <span className="text-amber-600 ml-0.5">（{s.homeStore}）</span>
                            ) : null}
                            {s.newHireLabel && (
                              <span className="text-orange-500 ml-0.5">（{s.newHireLabel}）</span>
                            )}
                            {s.temporaryLabel && (
                              <span className="text-purple-500 ml-0.5">（{s.temporaryLabel}）</span>
                            )}
                          </span>
                        </div>
                      ))}
                      {(day?.staff.length ?? 0) > maxStaff && (
                        <div className="text-[10px] text-slate-400">
                          +{(day?.staff.length ?? 0) - maxStaff} 人
                        </div>
                      )}
                      {(day?.deductions ?? []).map((ded, di) => (
                        <div key={di} className={`text-[10px] font-medium ${ded.isPositive ? "text-green-600" : "text-red-500"}`}>
                          {ded.isPositive ? "+" : "-"}{ded.hours}h {ded.label}{ded.note ? `（${ded.note}）` : ""}
                        </div>
                      ))}
                      {day?.efficiencyRatio != null && (
                        <div
                          className={`mt-1 text-[11px] font-medium ${
                            day.isExceed ? "text-purple-600"
                            : day.isAchieved ? "text-emerald-600"
                            : "text-slate-400"
                          }`}
                        >
                          工效 {Math.round(day.efficiencyRatio).toLocaleString()}
                        </div>
                      )}
                    </>
                  )}
                  {isHoliday && (
                    <div className="text-[8px] text-red-400">{day?.holiday}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">員工達標次數</h2>
        <p className="text-xs text-slate-500 mb-3">
          出勤日中，本門市工效比達標／超標的次數（達標不含超標，兩欄合計為原達標總次數）
        </p>
        {data.employeeAchievement.length ?
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500 font-normal">
                  <th className="py-2 pr-4 font-normal">員工</th>
                  <th className="py-2 pr-4 font-normal">類別</th>
                  <th className="py-2 pr-4 text-right font-normal">出勤工作日</th>
                  <th className="py-2 pr-4 text-right font-normal">達標次數</th>
                  <th className="py-2 pr-4 text-right font-normal">超標次數</th>
                  <th className="py-2 text-right font-normal">達標率</th>
                </tr>
              </thead>
              <tbody>
                {data.employeeAchievement.map((e) => (
                  <tr key={e.name} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{e.name}</td>
                    <td className="py-2 pr-4">
                      {e.isSupport ?
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                          {e.homeStore ?? "跨店支援"}
                        </span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400" />
                          本店
                        </span>
                      }
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{e.attendanceDays} 天</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {e.achievedDays - e.exceedDays} 次
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {e.exceedDays > 0 ? (
                        <span className="inline-block rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                          {e.exceedDays} 次
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{e.achieveRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        : <p className="py-8 text-center text-sm text-slate-400">本月尚無出勤紀錄</p>}
      </div>
    </div>
  );
}
