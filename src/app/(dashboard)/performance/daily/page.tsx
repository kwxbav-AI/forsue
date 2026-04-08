"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type DailyRow = {
  id: string;
  workDate: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  revenueAmount: number;
  totalWorkHours: number;
  efficiencyRatio: number;
  targetValue: number;
  isTargetMet: boolean;
  calculatedAt: string;
};

type SortKey = "storeName" | "revenueAmount" | "totalWorkHours" | "efficiencyRatio" | "targetValue" | "status";
type SortDir = "asc" | "desc";

export default function PerformanceDailyPage() {
  const [date, setDate] = useState(() => formatLocalDateInput());
  const [list, setList] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailStoreId, setDetailStoreId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ workDate: string; storeId: string; detail: { employeeCode: string; name: string; workHours: number }[] } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("storeName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/performance/daily?date=${date}`);
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [date]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const sortedList = useMemo(() => {
    const statusRank = (row: DailyRow) => {
      if (row.totalWorkHours === 0) return -1; // 無資料
      if (row.efficiencyRatio >= 6000) return 2; // 超標
      return row.isTargetMet ? 1 : 0; // 達標 / 未達標
    };

    const getVal = (row: DailyRow) => {
      switch (sortKey) {
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
          return row.storeName || "";
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

  useEffect(() => {
    if (!detailStoreId || !date) {
      setDetail(null);
      return;
    }
    fetch(`/api/performance/daily/detail?date=${date}&storeId=${detailStoreId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d))
      .catch(() => setDetail(null));
  }, [date, detailStoreId]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">每日工效比</h1>
        <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          回首頁
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此日期尚無績效資料，請先上傳出勤、營收並執行重算。
        </p>
      ) : (
        <>
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-[220px] min-w-[220px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("storeName")} className="hover:underline">
                      門市{sortIndicator("storeName")}
                    </button>
                  </th>
                  <th className="sticky left-[220px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-right font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("revenueAmount")} className="hover:underline">
                      營收{sortIndicator("revenueAmount")}
                    </button>
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("totalWorkHours")} className="hover:underline">
                      總工時{sortIndicator("totalWorkHours")}
                    </button>
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("efficiencyRatio")} className="hover:underline">
                      工效比{sortIndicator("efficiencyRatio")}
                    </button>
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("targetValue")} className="hover:underline">
                      目標值{sortIndicator("targetValue")}
                    </button>
                  </th>
                  <th className="px-4 py-2 text-center font-medium text-slate-700">
                    <button type="button" onClick={() => toggleSort("status")} className="hover:underline">
                      狀態{sortIndicator("status")}
                    </button>
                  </th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[220px] min-w-[220px] bg-white px-4 py-2 font-medium">
                      {row.storeName}
                    </td>
                    <td className="sticky left-[220px] z-[5] w-[140px] min-w-[140px] bg-white px-4 py-2 text-right">
                      {row.revenueAmount.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-4 py-2 text-right">{row.totalWorkHours}</td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        row.totalWorkHours === 0
                          ? "text-slate-400"
                          : row.isTargetMet
                            ? "text-green-600"
                            : "text-amber-600"
                      }`}
                    >
                      {row.totalWorkHours === 0 ? "—" : row.efficiencyRatio.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {row.targetValue.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.totalWorkHours === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : row.efficiencyRatio >= 6000 ? (
                        <span className="text-sky-700 font-semibold">超標</span>
                      ) : row.isTargetMet ? (
                        <span className="text-green-600">達標</span>
                      ) : (
                        <span className="text-amber-600">未達標</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailStoreId((s) => (s === row.storeId ? null : row.storeId))
                        }
                        className="text-sky-600 hover:underline"
                      >
                        {detailStoreId === row.storeId ? "收合明細" : "明細"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && detailStoreId && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-medium text-slate-800">
                {list.find((r) => r.storeId === detailStoreId)?.storeName} 當日工時明細
              </h3>
              <div className="relative max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-slate-200 bg-white text-left">
                    <th className="sticky left-0 z-20 w-[140px] min-w-[140px] bg-white py-1.5 font-medium text-slate-700">
                      員工代碼
                    </th>
                    <th className="sticky left-[140px] z-20 w-[140px] min-w-[140px] bg-white py-1.5 font-medium text-slate-700">
                      姓名
                    </th>
                    <th className="py-1.5 text-right font-medium text-slate-700">工時</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.detail.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="sticky left-0 z-[5] w-[140px] min-w-[140px] bg-white py-1.5">
                        {d.employeeCode}
                      </td>
                      <td className="sticky left-[140px] z-[5] w-[140px] min-w-[140px] bg-white py-1.5">
                        {d.name}
                      </td>
                      <td className="py-1.5 text-right">{d.workHours}</td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
