"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { addCalendarDaysUTC, formatLocalDateInput } from "@/lib/date";
import {
  OPS_FILTER_REGIONS,
  OPS_REGION_CATALOG,
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";

type DailyRow = {
  id: string;
  workDate: string;
  periodStart?: string;
  periodEnd?: string;
  aggregated?: boolean;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  region?: string;
  revenueAmount: number;
  totalWorkHours: number;
  efficiencyRatio: number;
  targetValue: number;
  isTargetMet: boolean;
  calculatedAt: string;
};

type SortKey =
  | "workDate"
  | "storeName"
  | "revenueAmount"
  | "totalWorkHours"
  | "efficiencyRatio"
  | "targetValue"
  | "status";
type SortDir = "asc" | "desc";

type StoreDetailRow = {
  type: "attendance" | "adjustment" | "dispatch_out" | "dispatch_in" | "subtotal";
  id: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  workDate: string;
  storeId: string;
  workHours: number;
  adjustmentReason: string | null;
};

type StoreDetailPayload = {
  workDate: string;
  storeId: string;
  storeName: string | null;
  rows: StoreDetailRow[];
};

type StoreOption = {
  id: string;
  name: string;
  department?: string | null;
};

function isSaturdayYmd(ymd: string): boolean {
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay() === 6;
}

function detailTypeLabel(type: StoreDetailRow["type"]) {
  switch (type) {
    case "attendance":
      return "正班";
    case "dispatch_in":
      return "調入支援";
    case "dispatch_out":
      return "調出";
    case "adjustment":
      return "異動";
    default:
      return "";
  }
}

function listDaysInRange(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    d = addCalendarDaysUTC(d, 1);
  }
  return out;
}

function HoursDetailDrawer({
  detail,
  loading,
  storeName,
  periodLabel,
  onClose,
}: {
  detail: StoreDetailPayload | null;
  loading: boolean;
  storeName: string;
  periodLabel: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const panel = (
    <div className="fixed inset-y-0 right-0 z-[9999] flex w-[min(320px,90vw)] flex-col border-l border-slate-200 bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{storeName}</p>
          <p className="text-xs text-slate-500">{periodLabel} 工時明細</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-4 mt-0.5 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto p-2">
        {loading ?
          <p className="px-2 py-4 text-xs text-slate-500">載入工時明細…</p>
        : !detail?.rows?.length ?
          <p className="px-2 py-4 text-xs text-slate-500">
            {storeName} · {periodLabel} 無工時明細
          </p>
        : <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="w-[38%] py-1 pl-1 pr-1">員工</th>
                <th className="w-[18%] py-1 pr-1 text-right">時數</th>
                <th className="w-[44%] py-1 pr-1">說明</th>
              </tr>
            </thead>
            <tbody>
              {detail.rows
                .filter((r) => r.type !== "subtotal")
                .map((r) => (
                  <tr key={r.id} className="border-t border-slate-50 align-top">
                    <td className="py-1 pl-1 pr-1">
                      <div className="truncate" title={`${r.name} ${r.employeeCode}`}>
                        {r.name}
                      </div>
                      <div className="truncate text-[10px] text-slate-400">{r.employeeCode}</div>
                    </td>
                    <td
                      className={`py-1 pr-1 text-right tabular-nums whitespace-nowrap ${
                        r.workHours < 0 ? "text-red-700" : "text-slate-800"
                      }`}
                    >
                      {Number(r.workHours).toFixed(2)}
                    </td>
                    <td className="break-words py-1 pr-1 leading-snug text-slate-600">
                      <span className="text-slate-400">[{detailTypeLabel(r.type)}]</span>{" "}
                      {r.adjustmentReason ?? "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export default function PerformanceDailyPage() {
  const today = formatLocalDateInput();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [region, setRegion] = useState("");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [list, setList] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverDetail, setHoverDetail] = useState<StoreDetailPayload | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const detailFetchRef = useRef(0);
  const [sortKey, setSortKey] = useState<SortKey>("storeName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: StoreOption[]) => setStores(Array.isArray(d) ? d : []))
      .catch(() => setStores([]));
  }, []);

  const storeOptions = useMemo(() => {
    if (!region) return stores;
    const group = OPS_REGION_CATALOG.find((g) => g.region === region);
    if (!group) return stores;
    const keys = new Set(group.storeNames.map(normalizeStoreKey));
    return stores.filter((s) => {
      const n = normalizeStoreKey(s.name);
      if (keys.has(n)) return true;
      return group.storeNames.some((ck) => storeNameMatchesCatalogKey(s.name, ck));
    });
  }, [stores, region]);

  const fetchList = useCallback(async () => {
    if (startDate > endDate) {
      setFetchError("開始日不可晚於結束日");
      setList([]);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (region) params.set("region", region);
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/performance/daily?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setFetchError(data.error || "查詢失敗");
        setList([]);
        return;
      }
      setList(Array.isArray(data.rows) ? data.rows : Array.isArray(data) ? data : []);
    } catch {
      setFetchError("查詢失敗");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, region, storeId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const isRangeMode = startDate !== endDate;
  /** 區間查詢顯示「區間」欄；單日不另顯示日期欄 */
  const showDateColumn = isRangeMode;

  const hasAnyActivity = useMemo(
    () => list.some((r) => r.revenueAmount > 0 || r.totalWorkHours > 0),
    [list]
  );

  const sortedList = useMemo(() => {
    const statusRank = (row: DailyRow) => {
      if (row.totalWorkHours === 0) return -1;
      if (!isSaturdayYmd(row.workDate) && row.efficiencyRatio >= 6000) return 2;
      return row.isTargetMet ? 1 : 0;
    };

    const getVal = (row: DailyRow) => {
      switch (sortKey) {
        case "workDate":
          return row.workDate;
        case "storeName":
          return row.storeName || "";
        case "revenueAmount":
          return row.revenueAmount;
        case "totalWorkHours":
          return row.totalWorkHours;
        case "efficiencyRatio":
          return row.totalWorkHours === 0 ? -Infinity : row.efficiencyRatio;
        case "targetValue":
          return row.targetValue;
        case "status":
          return statusRank(row);
        default:
          return row.workDate;
      }
    };

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), "zh-Hant") * dir;
    });
  }, [list, sortDir, sortKey]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const sortIndicator = useCallback(
    (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""),
    [sortDir, sortKey]
  );

  const loadHoverDetail = useCallback((row: DailyRow) => {
    const key = `${row.periodStart ?? row.workDate}|${row.periodEnd ?? row.workDate}|${row.storeId}`;
    setHoverKey(key);
    const reqId = ++detailFetchRef.current;
    setHoverLoading(true);
    setHoverDetail(null);

    const fetchOneDay = (ymd: string) =>
      fetch(`/api/performance/daily/detail?date=${ymd}&storeId=${row.storeId}`).then((r) =>
        r.json()
      ) as Promise<StoreDetailPayload>;

    const run =
      row.aggregated && row.periodStart && row.periodEnd ?
        (async () => {
          const days = listDaysInRange(row.periodStart!, row.periodEnd!);
          const payloads = await Promise.all(days.map(fetchOneDay));
          const merged: StoreDetailRow[] = [];
          for (let i = 0; i < days.length; i++) {
            const ymd = days[i];
            const label = ymd.slice(5).replace("-", "/");
            for (const r of payloads[i]?.rows ?? []) {
              if (r.type === "subtotal") continue;
              merged.push({
                ...r,
                id: `${ymd}-${r.id}`,
                workDate: ymd,
                adjustmentReason:
                  r.adjustmentReason ?
                    `${label} ${r.adjustmentReason}`
                  : label,
              });
            }
          }
          return {
            workDate: row.workDate,
            storeId: row.storeId,
            storeName: row.storeName,
            rows: merged,
          } satisfies StoreDetailPayload;
        })()
      : fetchOneDay(row.workDate);

    void run
      .then((d) => {
        if (detailFetchRef.current === reqId) {
          setHoverDetail(d);
          setHoverLoading(false);
        }
      })
      .catch(() => {
        if (detailFetchRef.current === reqId) {
          setHoverDetail(null);
          setHoverLoading(false);
        }
      });
  }, []);

  const clearHover = useCallback(() => {
    setHoverKey(null);
    setHoverDetail(null);
    setHoverLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">每日工效比</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">開始日</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">結束日</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">區域</span>
          <select
            value={region}
            onChange={(e) => {
              setRegion(e.target.value);
              setStoreId("");
            }}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[100px]"
          >
            <option value="">全部</option>
            {OPS_FILTER_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">門市</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[120px]"
          >
            <option value="">全部</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void fetchList()}
          disabled={loading}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? "查詢中…" : "查詢"}
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        {isRangeMode ?
          "區間查詢：每間門市一列為區間累計營收／工時／工效比；滑鼠移入可預覽區間工時明細（含調入支援）"
        : "滑鼠移入門市列可預覽當日工時明細（含他店調入支援人員與時數）"}
      </p>

      {loading ?
        <p className="text-sm text-slate-500">載入中…</p>
      : fetchError ?
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {fetchError}
        </p>
      : list.length === 0 ?
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此條件尚無營收或出勤資料，請確認已上傳並調整篩選。
        </p>
      : !hasAnyActivity ?
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此區間尚無營收或出勤資料。
        </p>
      : (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                {showDateColumn ?
                  <th className="px-3 py-2 text-left font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("workDate")} className="hover:underline">
                      {isRangeMode ? "區間" : "日期"}
                      {sortIndicator("workDate")}
                    </button>
                  </th>
                : null}
                <th className="sticky left-0 z-20 min-w-[120px] bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("storeName")} className="hover:underline">
                    門市{sortIndicator("storeName")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("revenueAmount")} className="hover:underline">
                    營收{sortIndicator("revenueAmount")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("totalWorkHours")} className="hover:underline">
                    總工時{sortIndicator("totalWorkHours")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("efficiencyRatio")} className="hover:underline">
                    工效比{sortIndicator("efficiencyRatio")}
                  </button>
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("targetValue")} className="hover:underline">
                    目標值{sortIndicator("targetValue")}
                  </button>
                </th>
                <th className="px-3 py-2 text-center font-medium text-slate-700">
                  <button type="button" onClick={() => toggleSort("status")} className="hover:underline">
                    狀態{sortIndicator("status")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedList.map((row) => {
                const rowKey = `${row.periodStart ?? row.workDate}|${row.periodEnd ?? row.workDate}|${row.storeId}`;
                const isHovered = hoverKey === rowKey;
                const periodLabel =
                  row.aggregated && row.periodStart && row.periodEnd ?
                    `${row.workDate}`
                  : row.workDate;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-slate-100 ${isHovered ? "bg-sky-50/80" : "hover:bg-slate-50"}`}
                    onClick={() => loadHoverDetail(row)}
                  >
                    {showDateColumn ?
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.workDate}</td>
                    : null}
                    <td className="sticky left-0 z-[5] min-w-[120px] bg-inherit px-3 py-2 font-medium">
                      {row.storeName}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.revenueAmount.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.totalWorkHours.toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        row.totalWorkHours === 0 ?
                          "text-slate-400"
                        : row.isTargetMet ?
                          "text-green-600"
                        : "text-amber-600"
                      }`}
                    >
                      {row.totalWorkHours === 0 ? "—" : row.efficiencyRatio.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 tabular-nums">
                      {row.targetValue.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.totalWorkHours === 0 ?
                        <span className="text-slate-400">—</span>
                      : row.aggregated ?
                        <span className="text-slate-500 text-xs">區間</span>
                      : !isSaturdayYmd(row.workDate) && row.efficiencyRatio >= 6000 ?
                        <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 font-semibold">
                          超標
                        </span>
                      : row.isTargetMet ?
                        <span className="text-green-600">達標</span>
                      : <span className="text-amber-600">未達標</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hoverKey ?
        <HoursDetailDrawer
          detail={hoverDetail}
          loading={hoverLoading}
          storeName={sortedList.find((r) => {
            const k = `${r.periodStart ?? r.workDate}|${r.periodEnd ?? r.workDate}|${r.storeId}`;
            return k === hoverKey;
          })?.storeName ?? ""}
          periodLabel={
            sortedList.find((r) => {
              const k = `${r.periodStart ?? r.workDate}|${r.periodEnd ?? r.workDate}|${r.storeId}`;
              return k === hoverKey;
            })?.workDate ?? ""
          }
          onClose={clearHover}
        />
      : null}
    </div>
  );
}
