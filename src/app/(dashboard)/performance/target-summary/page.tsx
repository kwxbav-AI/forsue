"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type SummaryRow = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  totalDays: number;
  metDays: number;
  notMetDays: number;
  metRate: number;
  avgEfficiencyRatio: number;
};

export default function TargetSummaryPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return formatLocalDateInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatLocalDateInput());
  const [list, setList] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/performance/target-summary?startDate=${startDate}&endDate=${endDate}`
    );
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">達標次數統計</h1>
        <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          回首頁
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">開始日期</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">結束日期</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此區間尚無績效資料。
        </p>
      ) : (
        <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-20 w-[180px] min-w-[180px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                  門市
                </th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">總天數</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">達標天數</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">未達標天數</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">達標率</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">平均工效比</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.storeId} className="border-b border-slate-100">
                  <td className="sticky left-0 z-[5] w-[180px] min-w-[180px] bg-white px-4 py-2 font-medium">
                    {row.storeName}
                  </td>
                  <td className="px-4 py-2 text-right">{row.totalDays}</td>
                  <td className="px-4 py-2 text-right text-green-600">{row.metDays}</td>
                  <td className="px-4 py-2 text-right text-amber-600">{row.notMetDays}</td>
                  <td className="px-4 py-2 text-right">
                    <span
                      className={
                        row.metRate >= 0.8 ? "text-green-600" : row.metRate >= 0.5 ? "text-amber-600" : "text-red-600"
                      }
                    >
                      {(row.metRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.avgEfficiencyRatio.toLocaleString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
