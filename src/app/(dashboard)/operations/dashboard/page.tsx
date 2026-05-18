"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

const T = {
  emDash: "\u2014",
  tilde: "\uFF5E",
  middot: "\u00B7",
  pleaseSelectDates: "\u8ACB\u9078\u64C7\u958B\u59CB\u65E5\u8207\u7D50\u675F\u65E5",
  startAfterEnd: "\u958B\u59CB\u65E5\u4E0D\u53EF\u665A\u65BC\u7D50\u675F\u65E5",
  queryFailed: "\u67E5\u8A62\u5931\u6557",
  queryFailedRetry: "\u67E5\u8A62\u5931\u6557\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66",
  rangeClamped: (ymd: string) =>
    `\u67E5\u8A62\u5340\u9593\u5DF2\u8ABF\u6574\u70BA\u81EA ${ymd} \u8D77\u7B97\uFF08\u8207\u4E0A\u50B3\u8CC7\u6599\u8D77\u65E5\u4E00\u81F4\uFF09`,
  syncFailed: "\u540C\u6B65\u5931\u6557",
  syncOk: (synced: number, created: number, updated: number) =>
    `\u5DF2\u540C\u6B65 ${synced} \u9593\u9580\u5E02\uFF08\u65B0\u589E ${created}\u3001\u66F4\u65B0 ${updated}\uFF09`,
  regionDefault: "\u6843\u5712\u5340\u3001\u5B9C\u862D\u5340\u3001\u53F0\u5317\u5340",
  title: "\u71DF\u904B\u7E3D\u89BD Dashboard",
  subtitle: (regions: string) =>
    `\u5340\u57DF\uFF0F\u9580\u5E02\u7531\u300C\u9580\u5E02\u7BA1\u7406\u300D\u81EA\u52D5\u540C\u6B65\uFF08${regions}\uFF09\uFF1B\u8ACB\u9078\u65E5\u671F\u5340\u9593\u5F8C\u6309\u300C\u67E5\u8A62\u300D\u3002`,
  storeTargets: "\u9580\u5E02\u76EE\u6A19\u8A2D\u5B9A",
  kpiRevenue: "\u5169\u5340\u7E3D\u71DF\u6536",
  kpiRegions: "\u6843\u5712\u5340 + \u5B9C\u862D\u5340",
  kpiRegionsHint: "\u6843\u5712\u5340 + \u5B9C\u862D\u5340\uFF08\u67E5\u8A62\u5F8C\u986F\u793A\uFF09",
  kpiEfficiency: "\u71DF\u904B\u90E8\u5DE5\u6548\u6BD4",
  kpiEfficiencyHint: "\u5169\u5340\u7E3D\u71DF\u6536 \u00F7 \u5169\u5340\u7E3D\u5DE5\u6642",
  kpiYoy: "YoY \u71DF\u6536\u6210\u9577\u7387",
  kpiYoyHint: "\u76F8\u8F03\u53BB\u5E74\u540C\u671F\uFF08\u6843\u5712\u5340 + \u5B9C\u862D\u5340\uFF09",
  startDate: "\u958B\u59CB\u65E5",
  endDate: "\u7D50\u675F\u65E5",
  region: "\u5340\u57DF",
  allRegions: "\u5168\u90E8\u5340\u57DF",
  store: "\u9580\u5E02",
  allStores: "\u5168\u90E8\u9580\u5E02",
  querying: "\u67E5\u8A62\u4E2D\u2026",
  query: "\u67E5\u8A62",
  syncing: "\u540C\u6B65\u4E2D\u2026",
  syncStores: "\u540C\u6B65\u9580\u5E02",
  loadingStores: "\u8F09\u5165\u9580\u5E02\u4E2D\u2026",
  loadedStores: (n: number) => `\u5DF2\u8F09\u5165 ${n} \u9593\u555F\u7528\u9580\u5E02`,
  selectAndQuery: "\u8ACB\u9078\u64C7\u689D\u4EF6\u5F8C\u6309\u300C\u67E5\u8A62\u300D\u3002",
  filterResult: "\u7BE9\u9078\u7D50\u679C",
  storeCount: (n: number) => `\uFF08${n} \u9593\u9580\u5E02\uFF09`,
  computing: "\u8A08\u7B97\u4E2D\u2026",
  noData:
    "\u6B64\u5340\u9593\u5C1A\u7121\u71DF\u6536\u6216\u51FA\u52E4\u8CC7\u6599\uFF0C\u8ACB\u78BA\u8A8D\u5DF2\u4E0A\u50B3\u8A72\u5340\u9593\u7684\u71DF\u6536\u8207\u51FA\u52E4\u6A94\u6848\u3002",
  revenue: "\u71DF\u696D\u984D",
  hours: "\u5DE5\u6642",
  efficiency: "\u5DE5\u6548\u6BD4",
  loadFilterFailed: "\u7121\u6CD5\u8F09\u5165\u7BE9\u9078\u7D50\u679C\uFF0C\u8ACB\u91CD\u65B0\u67E5\u8A62\u3002",
} as const;

type StoreOption = { id: string; storeName: string; region: string | null };

type Meta = {
  activeStoreCount: number;
  regions: string[];
  stores: StoreOption[];
};

type KpiMetrics = {
  totalRevenue: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  yoyGrowthRate: number | null;
  regionLabel: string;
  periodStartDate?: string;
  periodEndDate?: string;
};

type FilteredMetrics = {
  totalRevenue: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  filterLabel: string;
  storeCount: number;
  matchedStoreCount?: number;
  hasData?: boolean;
};

function round2(n: number): number {
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

const METRICS_DATA_START = "2026-04-01";

export default function OperationsDashboardPage() {
  const today = formatLocalDateInput();

  const [meta, setMeta] = useState<Meta | null>(null);
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics | null>(null);
  const [filteredMetrics, setFilteredMetrics] = useState<FilteredMetrics | null>(null);
  const [queried, setQueried] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(METRICS_DATA_START);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [storeId, setStoreId] = useState("");

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    const res = await fetch("/api/operations/dashboard");
    if (res.ok) {
      const data = await res.json();
      setMeta(data.meta);
    }
    setLoadingMeta(false);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const filteredStores =
    meta?.stores.filter((s) => !region || s.region === region) ?? [];

  async function handleQuery() {
    setMessage(null);
    if (!startDate || !endDate) {
      setMessage(T.pleaseSelectDates);
      return;
    }
    if (startDate > endDate) {
      setMessage(T.startAfterEnd);
      return;
    }

    setLoadingQuery(true);
    setQueried(true);
    setFilteredMetrics(null);
    setKpiMetrics(null);

    const params = new URLSearchParams({ startDate, endDate });
    if (storeId) {
      params.set("storeId", storeId);
    } else if (region) {
      params.set("region", region);
    }

    try {
      const res = await fetch(`/api/operations/dashboard?${params}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessage(data.error || T.queryFailed);
        return;
      }
      setMeta(data.meta);
      setKpiMetrics(data.kpiMetrics ?? null);
      setFilteredMetrics(data.filteredMetrics ?? null);
      if (data.query?.dateRangeClamped) {
        setMessage(T.rangeClamped(data.query.dataStartYmd ?? "2026-04-01"));
      }
    } catch {
      setMessage(T.queryFailedRetry);
    } finally {
      setLoadingQuery(false);
    }
  }

  async function handleSyncStores() {
    setMessage(null);
    setSyncing(true);
    const res = await fetch("/api/operations/stores/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) {
      setMessage(data.error || T.syncFailed);
      return;
    }
    setMessage(T.syncOk(data.synced ?? 0, data.created ?? 0, data.updated ?? 0));
    await loadMeta();
  }

  const regionHint =
    meta?.regions.length ? meta.regions.join("\u3001") : T.regionDefault;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{T.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{T.subtitle(regionHint)}</p>
        </div>
        <Link
          href="/operations/store-targets"
          className="shrink-0 rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {T.storeTargets}
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-sky-700">{T.kpiRevenue}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loadingQuery ?
              <span className="text-slate-800">{formatMoney(kpiMetrics.totalRevenue)}</span>
            : T.emDash}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {queried && kpiMetrics?.periodStartDate && kpiMetrics?.periodEndDate ?
              `${kpiMetrics.periodStartDate} ${T.tilde} ${kpiMetrics.periodEndDate} \u00b7 ${T.kpiRegions}`
            : queried ?
              T.kpiRegions
            : T.kpiRegionsHint}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-slate-800">{T.kpiEfficiency}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loadingQuery ?
              <span className="text-slate-800">
                {formatRatio(kpiMetrics.efficiencyRatio)}
              </span>
            : T.emDash}
          </p>
          <p className="mt-2 text-xs text-slate-500">{T.kpiEfficiencyHint}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-emerald-700">{T.kpiYoy}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-400">
            {queried && kpiMetrics && !loadingQuery ?
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

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{T.startDate}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{T.endDate}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{T.region}</span>
            <select
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setStoreId("");
              }}
              className="min-w-[120px] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">{T.allRegions}</option>
              {meta?.regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">{T.store}</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="min-w-[120px] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
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
            onClick={handleQuery}
            disabled={loadingQuery}
            className="rounded bg-slate-800 px-5 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {loadingQuery ? T.querying : T.query}
          </button>
          <button
            type="button"
            onClick={handleSyncStores}
            disabled={syncing}
            className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {syncing ? T.syncing : T.syncStores}
          </button>
        </div>

        <div className="mt-3 space-y-2 text-xs text-slate-500">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              {loadingMeta ? T.loadingStores : T.loadedStores(meta?.activeStoreCount ?? 0)}
            </span>
            {!queried ? <span>{T.selectAndQuery}</span> : null}
            {message ? <span className="text-slate-700">{message}</span> : null}
          </div>
          {queried ?
            <div className="rounded border border-slate-200 bg-white px-3 py-2 text-slate-700">
              <p className="font-medium text-slate-800">
                {T.filterResult}
                {filteredMetrics ?
                  <span className="ml-2 font-normal text-slate-500">
                    {startDate} {T.tilde} {endDate} {T.middot} {filteredMetrics.filterLabel}
                    {storeId ? "" : T.storeCount(filteredMetrics.storeCount)}
                  </span>
                : null}
              </p>
              {loadingQuery ?
                <p className="mt-1 text-slate-500">{T.computing}</p>
              : filteredMetrics ?
                !filteredMetrics.hasData &&
                filteredMetrics.totalRevenue <= 0 &&
                filteredMetrics.totalLaborHours <= 0 ?
                  <p className="mt-1 text-slate-500">{T.noData}</p>
                : <p className="mt-1">
                    {T.revenue}{" "}
                    <span className="font-medium">
                      {formatMoney(filteredMetrics.totalRevenue)}
                    </span>
                    {` ${T.middot} ${T.hours} `}
                    <span className="font-medium">
                      {formatHours(filteredMetrics.totalLaborHours)}
                    </span>
                    {` hr ${T.middot} ${T.efficiency} `}
                    <span className="font-medium">
                      {formatRatio(filteredMetrics.efficiencyRatio)}
                    </span>
                  </p>
              : <p className="mt-1 text-slate-500">{T.loadFilterFailed}</p>
              }
            </div>
          : null}
        </div>
      </div>
    </div>
  );
}
