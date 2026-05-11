"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ApiHistoryMonth = { key: string; label: string };

type ApiMetaWeek = {
  index: number;
  startYmd: string;
  endYmd: string;
  workingDays: number;
};

type ApiMeta = {
  uploadedWorkingDays: number;
  uploadedDataDays?: number;
  calendarWorkingDaysInForecastWindow?: number;
  calendarWeekdayDays?: number;
  calendarSaturdayDays?: number;
  forecastWindowStartYmd?: string | null;
  forecastWindowEndYmd?: string | null;
  totalMonthWorkingDays: number;
  weekdayUploadedDataDays?: number;
  saturdayUploadedDataDays?: number;
  revenueDenominator?: string;
  revenueExcludesTodayTaipei?: boolean;
  weeks: ApiMetaWeek[];
};

type ApiStoreRow = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  region: string | null;
  actualMtd: number;
  forecast: number | null;
  forecastPct: number | null;
  historyByMonth: number[];
};

type ApiTotals = {
  actualMtd: number;
  forecast: number | null;
  forecastPct: number | null;
  historyByMonth: number[];
  weekdayAvgRevenue: number;
  saturdayAvgRevenue: number;
};

type ApiResponse = {
  month: string;
  monthStart: string;
  monthEnd: string;
  asOfDate: string;
  asOfDateRequested?: string;
  historyMonths: ApiHistoryMonth[];
  meta: ApiMeta;
  stores: ApiStoreRow[];
  totals: ApiTotals;
};

type SortDir = "asc" | "desc";

type SortKey =
  | { kind: "region" }
  | { kind: "storeName" }
  | { kind: "actualMtd" }
  | { kind: "forecast" }
  | { kind: "forecastPct" }
  | { kind: "history"; index: number };

function sameSortKey(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "history" && b.kind === "history") return a.index === b.index;
  return true;
}

function toMonthInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMdFromYmd(ymd: string): string {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!r) return ymd;
  return `${Number(r[2])}/${Number(r[3])}`;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("zh-TW");
}

function formatPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

/** 預估%：>20% 橘底黑字；>0% 紅字；<0% 綠字 */
function forecastPctTdClass(p: number | null, variant: "body" | "footer"): string {
  const pad = variant === "footer" ? "px-2 py-2 " : "px-2 py-1.5 ";
  const base = `${pad}text-right tabular-nums `;
  const bgBody = variant === "body" ? "bg-white " : "bg-slate-50 ";
  if (p == null || Number.isNaN(p)) return `${base}${bgBody}text-slate-600`;
  if (p > 20) return `${base}rounded bg-orange-300 text-black font-semibold`;
  if (p > 0) return `${base}${bgBody}text-red-600 font-medium`;
  if (p < 0) return `${base}${bgBody}text-green-600 font-medium`;
  return `${base}${bgBody}text-slate-700`;
}

function formatWeekRange(w: ApiMetaWeek): string {
  return `${formatMdFromYmd(w.startYmd)}-${formatMdFromYmd(w.endYmd)}`;
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined, dir: SortDir): number {
  const aNil = a == null || Number.isNaN(a);
  const bNil = b == null || Number.isNaN(b);
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  const c = (a as number) - (b as number);
  return dir === "asc" ? c : -c;
}

function compareString(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  const as = (a ?? "").trim();
  const bs = (b ?? "").trim();
  const cmp = as.localeCompare(bs, "zh-Hant");
  return dir === "asc" ? cmp : -cmp;
}

export default function RevenueForecastReportPage() {
  const [month, setMonth] = useState(() => toMonthInputValue(new Date()));
  const [asOfInput, setAsOfInput] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: { kind: "region" },
    dir: "asc",
  });
  const sortKey = sort.key;
  const sortDir = sort.dir;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let url = `/api/reports/revenue-forecast?month=${encodeURIComponent(month)}`;
    if (asOfInput.trim()) url += `&asOfDate=${encodeURIComponent(asOfInput.trim())}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as ApiResponse | { error?: string } | null;
    if (!res.ok) {
      setData(null);
      setError((json as any)?.error || "載入失敗");
      setLoading(false);
      return;
    }
    setData(json as ApiResponse);
    setLoading(false);
  }, [month, asOfInput]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (sameSortKey(prev.key, key)) {
        return { key: prev.key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }, []);

  const sortedStores = useMemo(() => {
    const list = data?.stores ? [...data.stores] : [];
    const dir = sortDir;
    list.sort((a, b) => {
      switch (sortKey.kind) {
        case "region":
          return compareString(a.region, b.region, dir) || compareString(a.storeName, b.storeName, "asc");
        case "storeName":
          return compareString(a.storeName, b.storeName, dir);
        case "actualMtd":
          return compareNullableNumber(a.actualMtd, b.actualMtd, dir);
        case "forecast":
          return compareNullableNumber(a.forecast, b.forecast, dir);
        case "forecastPct":
          return compareNullableNumber(a.forecastPct, b.forecastPct, dir);
        case "history": {
          const i = sortKey.index;
          const av = a.historyByMonth[i];
          const bv = b.historyByMonth[i];
          return compareNullableNumber(av, bv, dir);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [data?.stores, sortKey, sortDir]);

  const sortIndicator = useCallback(
    (key: SortKey) => {
      if (!sameSortKey(sortKey, key)) return "⇅";
      return sortDir === "asc" ? "↑" : "↓";
    },
    [sortKey, sortDir]
  );

  const thBtn = (label: string, key: SortKey, btnClass?: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`inline-flex w-full items-start justify-between gap-1 text-left font-medium hover:text-sky-700 ${btnClass ?? ""}`}
    >
      <span className="whitespace-pre-line leading-tight">{label}</span>
      <span className="shrink-0 text-xs font-normal text-slate-400">{sortIndicator(key)}</span>
    </button>
  );

  const currentMonthShortLabel = month ? `${month.slice(0, 4)}年${month.slice(5, 7).replace(/^0/, "")}月` : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800">營收預估分析</h1>
        <Link
          href="/reports"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回報表區
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">月份</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="text-sm text-slate-600">資料截止日</span>
          <input
            type="date"
            value={asOfInput}
            onChange={(e) => setAsOfInput(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">未選時以台北「昨天」為上限（不含今日營收）</span>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
          disabled={loading}
        >
          重新整理
        </button>
        {data ? (
          <span className="text-sm text-slate-500">
            區間 {formatMdFromYmd(data.monthStart)}-{formatMdFromYmd(data.asOfDate)}
            （{currentMonthShortLabel} 實績截至該日止
            {data.asOfDateRequested && data.asOfDateRequested !== data.asOfDate
              ? `；已依「不含今日」自 ${formatMdFromYmd(data.asOfDateRequested)} 調整為 ${formatMdFromYmd(data.asOfDate)}`
              : ""}
            ）
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : !data ? null : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setShowMeta((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <span>背後運算資料（工作日、週切割）</span>
              <span className="text-slate-400">{showMeta ? "▼" : "▶"}</span>
            </button>
            {showMeta ? (
              <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-700">
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-xs text-slate-500">預估分母（日曆工作天）</dt>
                    <dd className="font-medium">
                      {data.meta.calendarWorkingDaysInForecastWindow ?? data.meta.uploadedWorkingDays} 天
                    </dd>
                    {data.meta.forecastWindowStartYmd && data.meta.forecastWindowEndYmd ? (
                      <dd className="mt-0.5 text-xs text-slate-500">
                        門市達標週視窗 {formatMdFromYmd(data.meta.forecastWindowStartYmd)}–
                        {formatMdFromYmd(data.meta.forecastWindowEndYmd)}：排除週日與「設定區・假日」後之日數（與門市達標工作日一致）。
                      </dd>
                    ) : (
                      <dd className="mt-0.5 text-xs text-slate-500">—</dd>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">其中平日 / 週六（日曆）</dt>
                    <dd className="font-medium">
                      {data.meta.calendarWeekdayDays ?? "—"} / {data.meta.calendarSaturdayDays ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">帳上有資料天數（對照）</dt>
                    <dd className="font-medium">{data.meta.uploadedDataDays ?? "—"} 天</dd>
                    <dd className="mt-0.5 text-xs text-slate-500">
                      視窗內任一家有績效日結之日數（不作分母）。
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">其中平日 / 週六（僅帳上）</dt>
                    <dd className="font-medium">
                      {data.meta.weekdayUploadedDataDays ?? "—"} / {data.meta.saturdayUploadedDataDays ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">當月總工作天（D34）</dt>
                    <dd className="font-medium">{data.meta.totalMonthWorkingDays} 天</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">備註</dt>
                    <dd className="text-xs leading-snug text-slate-600">
                      D34 與門市達標全月加總一致。「5月實績」為週視窗內加總；預估整月＝該加總 ÷ 日曆工作天 × D34（週日與假日設定已排除）。
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[480px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2 pr-3 text-left">週序</th>
                        <th className="py-2 pr-3 text-left">區間</th>
                        <th className="py-2 text-right">工作日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.meta.weeks.map((w) => (
                        <tr key={w.index} className="border-b border-slate-50">
                          <td className="py-1.5 pr-3">第{w.index}週</td>
                          <td className="py-1.5 pr-3">{formatWeekRange(w)}</td>
                          <td className="py-1.5 text-right">{w.workingDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="sticky top-0 z-30 border-b border-slate-200 shadow-sm">
                  <th className="sticky left-0 z-40 min-w-[100px] bg-slate-100 px-2 py-2 text-left text-slate-700">
                    {thBtn("區域", { kind: "region" })}
                  </th>
                  <th className="sticky left-[100px] z-40 min-w-[110px] border-r border-slate-200 bg-slate-100 px-2 py-2 text-left text-slate-700">
                    {thBtn("分店", { kind: "storeName" })}
                  </th>
                  <th className="min-w-[100px] bg-slate-100 px-2 py-2 text-slate-700">
                    {thBtn(`${data.month.slice(5, 7).replace(/^0/, "")}月\n實績`, { kind: "actualMtd" }, "text-xs")}
                  </th>
                  <th className="min-w-[100px] bg-slate-100 px-2 py-2 text-slate-700">
                    {thBtn("預估\n整月", { kind: "forecast" }, "text-xs")}
                  </th>
                  <th className="min-w-[80px] bg-slate-100 px-2 py-2 text-slate-700">
                    {thBtn("預估%", { kind: "forecastPct" })}
                  </th>
                  {data.historyMonths.map((hm, hi) => (
                    <th
                      key={hm.key}
                      className="min-w-[88px] whitespace-nowrap bg-slate-100 px-2 py-2 text-left text-xs font-medium text-slate-700"
                    >
                      {thBtn(hm.label, { kind: "history", index: hi }, "text-xs")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedStores.map((row) => (
                  <tr key={row.storeId} className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-slate-700">
                      {row.region ?? "—"}
                    </td>
                    <td className="sticky left-[100px] z-10 border-r border-slate-100 bg-white px-2 py-1.5 font-medium text-slate-900">
                      {row.storeName}
                    </td>
                    <td className="bg-white px-2 py-1.5 text-right tabular-nums">{formatInt(row.actualMtd)}</td>
                    <td className="bg-white px-2 py-1.5 text-right tabular-nums">
                      {row.forecast == null ? "—" : formatInt(row.forecast)}
                    </td>
                    <td className={forecastPctTdClass(row.forecastPct, "body")}>{formatPct(row.forecastPct)}</td>
                    {row.historyByMonth.map((v, i) => (
                      <td key={data.historyMonths[i]?.key ?? i} className="bg-white px-2 py-1.5 text-right tabular-nums">
                        {formatInt(v)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
                  <td className="sticky left-0 z-10 bg-slate-50 px-2 py-2">合計</td>
                  <td className="sticky left-[100px] z-10 border-r border-slate-100 bg-slate-50 px-2 py-2">—</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatInt(data.totals.actualMtd)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {data.totals.forecast == null ? "—" : formatInt(data.totals.forecast)}
                  </td>
                  <td className={forecastPctTdClass(data.totals.forecastPct, "footer")}>
                    {formatPct(data.totals.forecastPct)}
                  </td>
                  {data.totals.historyByMonth.map((v, i) => (
                    <td key={`t-${data.historyMonths[i]?.key ?? i}`} className="px-2 py-2 text-right tabular-nums">
                      {formatInt(v)}
                    </td>
                  ))}
                </tr>
                <tr className="bg-emerald-50/80 font-medium text-slate-900">
                  <td className="sticky left-0 z-10 bg-emerald-50/80 px-2 py-2" colSpan={2}>
                    平日平均（迄截止日）
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatInt(data.totals.weekdayAvgRevenue)}</td>
                  <td className="px-2 py-2 text-slate-500" colSpan={2 + data.historyMonths.length}>
                    全門市·僅周一至五工作日之日均營收加總
                  </td>
                </tr>
                <tr className="border-b border-slate-200 bg-amber-50/80 font-medium text-slate-900">
                  <td className="sticky left-0 z-10 bg-amber-50/80 px-2 py-2" colSpan={2}>
                    週六平均（迄截止日）
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatInt(data.totals.saturdayAvgRevenue)}</td>
                  <td className="px-2 py-2 text-slate-500" colSpan={2 + data.historyMonths.length}>
                    全門市·僅周六工作日之日均營收加總
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
