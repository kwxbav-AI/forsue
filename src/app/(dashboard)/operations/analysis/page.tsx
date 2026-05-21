"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const T = {
  emDash: "\u2014",
  tilde: "\uFF5E",
  middot: "\u00B7",
  title: "\u71DF\u904B\u7E3E\u6548\u7E3D\u89BD",
  subtitle: "\u7BE9\u9078\u65E5\u671F\u8207\u9580\u5E02\u5F8C\u6309\u300C\u91CD\u65B0\u6574\u7406\u300D\u67E5\u770B\u7E3E\u6548\u6307\u6A19",
  refresh: "\u91CD\u65B0\u6574\u7406",
  refreshing: "\u8F09\u5165\u4E2D\u2026",
  store: "\u9580\u5E02",
  region: "\u5340\u57DF",
  allRegions: "\u5168\u90E8\u5340\u57DF",
  allStores: "\u8ACB\u9078\u64C7\u9580\u5E02",
  storeTargets: "\u9580\u5E02\u76EE\u6A19\u8A2D\u5B9A",
  syncStores: "\u540C\u6B65\u9580\u5E02",
  revenue: "\u71DF\u696D\u984D",
  hours: "\u5DE5\u6642",
  efficiency: "\u5DE5\u6548\u6BD4",
  revenueForecast: "\u71DF\u6536\u9810\u4F30\u503C",
  revenueAchievement: "\u71DF\u6536\u9054\u6210\u503C",
  revenueAchievementRate: "\u71DF\u6536\u9054\u6210\u7387",
  yoy: "YoY \u71DF\u6536\u6210\u9577\u7387",
  yoySub: "\u8F03\u53BB\u5E74\u540C\u671F",
  dailyBizHours: "\u9580\u5E02\u6BCF\u65E5\u71DF\u696D\u6642\u9577",
  dailyBizHoursSub: "\u5E73\u5747\u6BCF\u65E5\u71DF\u696D\u6642\u9577",
  hoursDetail: "\u5DE5\u6642\u660E\u7D30",
  actualHours: "\u5BE6\u969B\u51FA\u52E4\u7E3D\u5DE5\u6642",
  overtimeHours: "\u52A0\u73ED\u5DE5\u6642",
  overtimeRatio: "\u52A0\u73ED\u6642\u6578\u5360\u6BD4",
  presetCompare: "\u9810\u8A2D\u5DE5\u6642\u6BD4\u8F03",
  periodPresetHours: "\u5340\u9593\u9810\u8A2D\u5DE5\u6642\u5408\u8A08",
  periodPresetHint: "\u6BCF\u65E5\u9810\u8A2D\u5DE5\u6642 \u00D7 \u5DE5\u4F5C\u5929\u6578",
  hoursDiff: "\u5DE5\u6642\u5DEE\u7570",
  hoursDiffSub: "\u5BE6\u969B\u51FA\u52E4\u7E3D\u5DE5\u6642 \u2212 \u5340\u9593\u9810\u8A2D\u5DE5\u6642",
  settingsWarn:
    "\u8ACB\u81F3\u300C\u71DF\u904B\u9580\u5E02\u7BA1\u7406\u300D\u8A2D\u5B9A\u71DF\u696D\u6642\u9577\u8207\u9810\u8A2D\u5DE5\u6642\uFF0C\u8A2D\u5B9A\u5F8C\u5373\u53EF\u770B\u5230\u9810\u8A2D\u5DE5\u6642\u8207\u5DE5\u6642\u5DEE\u7570\u5206\u6790",
  goSettings: "\u524D\u5F80\u8A2D\u5B9A",
  dailyRevenueTrend: "\u6BCF\u65E5\u71DF\u696D\u984D\u8DA8\u52E2",
  dailyHoursTrend: "\u6BCF\u65E5\u5DE5\u6642\u8DA8\u52E2",
  viewDetail: "\u67E5\u770B\u660E\u7D30",
  summary: (rev: string, hrs: string, eff: string) =>
    `\u7E3D\u7D50\uFF1A\u5340\u9593\u5167\u7E3D\u71DF\u696D\u984D\u70BA ${rev} \u5143\uFF0C\u7E3D\u5DE5\u6642\u70BA ${hrs} hr\uFF0C\u6574\u9AD4\u5DE5\u6548\u6BD4\u70BA ${eff} \u5143 / hr\u3002`,
  yuan: "\u5143",
  hr: "hr",
  yuanPerHr: "\u5143 / hr",
  pct: "%",
  queryFailed: "\u67E5\u8A62\u5931\u6557",
  selectStore: "\u8ACB\u9078\u64C7\u9580\u5E02\u5F8C\u518D\u67E5\u770B",
  chartsNote:
    "\u71DF\u696D\u3001\u5DE5\u6642\u8207\u5716\u8868\u540C\u5E97\u5217\u76F8\u540C\uFF08\u5982\u5716\u8868\u300C\u5973\u4E2D\u300D=\u672C\u9801\u300C\u5973\u4E2D\u5E97\u300D\uFF09",
  kpiRevenue: "\u5168\u516C\u53F8\u71DF\u6536\u9054\u6210\u503C",
  kpiRegions: "\u5B9C\u862D\u5340 + \u6843\u5712\u5340",
  kpiRegionsHint: "\u5B9C\u862D\u5340 + \u6843\u5712\u5340\uFF08\u67E5\u8A62\u5F8C\u986F\u793A\uFF09",
  kpiEfficiency: "\u71DF\u904B\u90E8\u5DE5\u6548\u6BD4",
  kpiEfficiencyHint: "\u71DF\u6536\u9054\u6210\u503C \u00F7 \u7E3D\u5DE5\u6642",
  kpiYoy: "YoY \u71DF\u6536\u6210\u9577\u7387",
  kpiYoyHint: "\u76F8\u8F03\u53BB\u5E74\u540C\u671F",
} as const;

import { OPS_REVENUE_METRICS_START_YMD } from "@/lib/performance-metrics-range";
import { currentMonthStartYmdLocal } from "@/lib/operations-default-dates";

type StoreOption = {
  id: string;
  storeName: string;
  region: string;
  catalogKey?: string;
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
  hasData?: boolean;
  revenueForecast?: number | null;
  revenueAchievement?: number;
  revenueAchievementRate?: number | null;
  yoyGrowthRate?: number | null;
  actualAttendanceHours?: number;
  overtimeHours?: number | null;
  overtimeRatio?: number | null;
  dailyBusinessHours?: number | null;
  defaultLaborHours?: number | null;
  laborHoursDifference?: number | null;
  workingDaysInRange?: number;
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
  if (n == null || Number.isNaN(n)) return T.emDash;
  return Math.round(n).toLocaleString("zh-TW");
}

function formatYoy(n: number | null) {
  if (n == null || Number.isNaN(n)) return T.emDash;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatPctValue(n: number | null) {
  if (n == null || Number.isNaN(n)) return T.emDash;
  return n.toFixed(1);
}

function dashMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return T.emDash;
  return formatMoney(n);
}

function dashHours(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return T.emDash;
  return formatHours(n);
}

function IconBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
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
  valueClass = "text-slate-800",
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
  iconClass: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <IconBadge className={iconClass}>{icon}</IconBadge>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>
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
        <p className="text-lg font-bold text-slate-800 tabular-nums">
          {value}
          <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span>
        </p>
      </div>
    </div>
  );
}

export default function OperationsDashboardPage() {
  const searchParams = useSearchParams();
  const today = formatLocalDateInput();
  const [meta, setMeta] = useState<{
    regions: string[];
    stores: StoreOption[];
  } | null>(null);
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics | null>(null);
  const [filtered, setFiltered] = useState<FilteredMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queried, setQueried] = useState(false);

  const [startDate, setStartDate] = useState(currentMonthStartYmdLocal);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [storeId, setStoreId] = useState("");
  const didInitSelection = useRef(false);
  const didAutoFromUrl = useRef(false);
  const didAutoLoadDefault = useRef(false);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/operations/dashboard");
    if (res.ok) {
      const data = await res.json();
      setMeta({ regions: data.meta?.regions ?? [], stores: data.meta?.stores ?? [] });
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

  const filteredStores = useMemo(
    () => meta?.stores.filter((s) => !region || s.region === region) ?? [],
    [meta, region]
  );

  const selectedStore = meta?.stores.find((s) => s.id === storeId);

  async function handleRefresh() {
    setMessage(null);
    if (!startDate || !endDate) return;
    if (startDate > endDate) return;
    setLoading(true);
    setQueried(true);
    setFiltered(null);
    setKpiMetrics(null);

    const params = new URLSearchParams({
      startDate,
      endDate,
      skipDailyTrend: "1",
      page: "0",
      pageSize: "1",
    });
    if (storeId) params.set("storeId", storeId);
    else if (region) params.set("region", region);

    try {
      const res = await fetch(`/api/operations/dashboard?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || T.queryFailed);
        return;
      }
      setKpiMetrics(data.kpiMetrics ?? null);
      setFiltered(data.filteredMetrics ?? null);
    } catch {
      setMessage(T.queryFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const urlStore = searchParams.get("storeId") || searchParams.get("store");
    if (didAutoFromUrl.current || !urlStore || !meta?.stores.length) return;
    if (storeId !== urlStore || !startDate || !endDate) return;
    didAutoFromUrl.current = true;
    void handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, startDate, endDate, meta, searchParams]);

  useEffect(() => {
    if (didAutoLoadDefault.current || didAutoFromUrl.current || !meta?.stores.length || !storeId) {
      return;
    }
    didAutoLoadDefault.current = true;
    void handleRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, storeId, startDate, endDate]);

  async function handleSyncStores() {
    setSyncing(true);
    await fetch("/api/operations/stores/sync", { method: "POST" });
    setSyncing(false);
    await loadMeta();
  }

  const m = filtered;
  const hasLaborSettings =
    m?.defaultLaborHours != null && m?.dailyBusinessHours != null;
  const chartData = m?.dailyTrend ?? [];

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{T.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{T.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/operations/store-targets"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {T.storeTargets}
          </Link>
          <button
            type="button"
            onClick={() => void handleSyncStores()}
            disabled={syncing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {syncing ? T.refreshing : T.syncStores}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-sky-700">{T.kpiRevenue}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loading ?
              <span className="text-slate-800">{formatMoney(kpiMetrics.totalRevenue)}</span>
            : T.emDash}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {queried && kpiMetrics?.periodStartDate && kpiMetrics?.periodEndDate ?
              `${kpiMetrics.periodStartDate} ${T.tilde} ${kpiMetrics.periodEndDate} \u00b7 ${kpiMetrics.regionLabel ?? T.kpiRegions}`
            : queried ?
              T.kpiRegions
            : T.kpiRegionsHint}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-slate-800">{T.kpiEfficiency}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loading ?
              <span className="text-slate-800">
                {formatRatio(kpiMetrics.efficiencyRatio)}
                <span className="ml-1 text-base font-normal text-slate-500">
                  {T.yuanPerHr}
                </span>
              </span>
            : T.emDash}
          </p>
          <p className="mt-2 text-xs text-slate-500">{T.kpiEfficiencyHint}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">{T.kpiYoy}</p>
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
            : T.emDash}
          </p>
          <p className="mt-2 text-xs text-slate-500">{T.kpiYoyHint}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">{"\u65E5\u671F\u5340\u9593"}</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <span className="text-slate-400">{T.tilde}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">{T.region}</span>
          <select
            value={region}
            onChange={(e) => {
              const newRegion = e.target.value;
              setRegion(newRegion);
              if (!newRegion) {
                setStoreId("");
                return;
              }
              const firstInRegion = meta?.stores.find((s) => s.region === newRegion);
              setStoreId(firstInRegion?.id ?? "");
            }}
            className="min-w-[110px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">{T.allRegions}</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">{T.store}</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">{T.allStores}</option>
            {filteredStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? T.refreshing : T.refresh}
        </button>
      </div>

      {message ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {message}
        </p>
      : null}

      {!queried || loading ?
        <p className="text-center text-sm text-slate-500 py-12">
          {loading ? T.refreshing : T.selectStore}
        </p>
      : m ?
        <>
          <p className="text-xs text-slate-400">
            {T.chartsNote}
            {selectedStore ?
              <span className="ml-2 text-slate-600">
                {startDate} {T.tilde} {endDate} {T.middot} {m.filterLabel}
              </span>
            : null}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <TopMetricCard
              label={T.revenue}
              value={formatMoney(m.totalRevenue)}
              unit={T.yuan}
              icon={"\uD83D\uDCB0"}
              iconClass="bg-blue-100 text-blue-600"
            />
            <TopMetricCard
              label={T.hours}
              value={formatHours(m.totalLaborHours)}
              unit={T.hr}
              icon={"\u23F1"}
              iconClass="bg-emerald-100 text-emerald-600"
            />
            <TopMetricCard
              label={T.efficiency}
              value={formatRatio(m.efficiencyRatio)}
              unit={T.yuanPerHr}
              icon={"\u26A1"}
              iconClass="bg-violet-100 text-violet-600"
            />
            <TopMetricCard
              label={T.revenueForecast}
              value={dashMoney(m.revenueForecast)}
              unit={T.yuan}
              icon={"\uD83D\uDCC8"}
              iconClass="bg-amber-100 text-amber-600"
            />
            <TopMetricCard
              label={T.revenueAchievement}
              value={formatMoney(m.revenueAchievement ?? m.totalRevenue)}
              unit={T.yuan}
              icon={"\u2713"}
              iconClass="bg-teal-100 text-teal-600"
            />
            <TopMetricCard
              label={T.revenueAchievementRate}
              value={formatPctValue(m.revenueAchievementRate ?? null)}
              unit={T.pct}
              icon={"%"}
              iconClass="bg-rose-100 text-rose-600"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <IconBadge className="bg-sky-100 text-sky-600">{"\uD83D\uDCCA"}</IconBadge>
              <div>
                <p className="text-sm font-medium text-slate-800">{T.yoy}</p>
                <p className="text-2xl font-bold text-slate-800">{formatYoy(m.yoyGrowthRate ?? null)}</p>
                <p className="text-xs text-slate-500">{T.yoySub}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <IconBadge className="bg-indigo-100 text-indigo-600">{"\u23F0"}</IconBadge>
              <div>
                <p className="text-sm font-medium text-slate-800">{T.dailyBizHours}</p>
                <p className="text-2xl font-bold text-slate-800">
                  {dashHours(m.dailyBusinessHours)}
                  <span className="ml-1 text-sm font-normal text-slate-500">{T.hr}</span>
                </p>
                <p className="text-xs text-slate-500">{T.dailyBizHoursSub}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard title={T.hoursDetail}>
              <div className="space-y-3">
                <MiniStat
                  label={T.actualHours}
                  value={formatHours(m.actualAttendanceHours ?? m.totalLaborHours)}
                  unit={T.hr}
                  icon={"\uD83D\uDC65"}
                  iconBg="bg-blue-100 text-blue-600"
                />
                <MiniStat
                  label={T.overtimeHours}
                  value={dashHours(m.overtimeHours)}
                  unit={T.hr}
                  icon={"\u23F0"}
                  iconBg="bg-red-100 text-red-600"
                />
                <MiniStat
                  label={T.overtimeRatio}
                  value={formatPctValue(m.overtimeRatio ?? null)}
                  unit={T.pct}
                  icon={"\u25D0"}
                  iconBg="bg-orange-100 text-orange-600"
                />
              </div>
            </PanelCard>

            <PanelCard title={T.presetCompare}>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">{T.periodPresetHours}</p>
                  <p className="text-lg font-bold text-slate-800">
                    {dashHours(m.defaultLaborHours)}
                    <span className="ml-1 text-xs font-normal text-slate-500">{T.hr}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{T.periodPresetHint}</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-500">{T.hoursDiff}</p>
                  <p className="text-lg font-bold text-slate-800">
                    {dashHours(m.laborHoursDifference)}
                    <span className="ml-1 text-xs font-normal text-slate-500">{T.hr}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{T.hoursDiffSub}</p>
                </div>
                {!hasLaborSettings ?
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs text-amber-900">{T.settingsWarn}</p>
                    <Link
                      href="/operations/stores"
                      className="mt-2 inline-block rounded-md bg-amber-400 px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-500"
                    >
                      {T.goSettings}
                    </Link>
                  </div>
                : null}
              </div>
            </PanelCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelCard
              title={T.dailyRevenueTrend}
              action={
                <Link href="/reports/charts" className="text-xs text-sky-600 hover:underline">
                  {T.viewDetail}
                </Link>
              }
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatMoney(Number(v))} />
                    <Tooltip
                      formatter={(v: number) => [formatMoney(v), T.revenue]}
                      labelFormatter={(l) => String(l)}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#2563eb"
                      fill="url(#revGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard
              title={T.dailyHoursTrend}
              action={
                <Link href="/reports/revenue" className="text-xs text-sky-600 hover:underline">
                  {T.viewDetail}
                </Link>
              }
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => [formatHours(v), T.hours]}
                      labelFormatter={(l) => String(l)}
                    />
                    <Line
                      type="monotone"
                      dataKey="laborHours"
                      stroke="#16a34a"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span className="mr-2">{"\uD83D\uDCA1"}</span>
            {T.summary(
              formatMoney(m.totalRevenue),
              formatHours(m.totalLaborHours),
              formatRatio(m.efficiencyRatio)
            )}
          </div>
        </>
      : null}
    </div>
  );
}
