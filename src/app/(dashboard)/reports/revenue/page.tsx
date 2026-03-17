"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type RevenueRow = {
  id: string;
  storeName: string;
  department: string;
  revenueDate: string;
  revenueAmount: number;
};

type Store = {
  id: string;
  name: string;
  isActive?: boolean;
  department?: string | null;
};

export default function RevenueReportPage() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [department, setDepartment] = useState("");
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: Store[]) => setStores(d))
      .catch(() => setStores([]));
  }, []);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      if (s.department) set.add(s.department);
    }
    return Array.from(set).sort();
  }, [stores]);

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    if (department) params.set("department", department);

    const res = await fetch(`/api/reports/revenue?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as RevenueRow[];
      setRows(data);
    } else {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRevenue = useMemo(
    () => rows.reduce((sum, r) => sum + (r.revenueAmount || 0), 0),
    [rows]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">每日營收報表</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">起日</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">迄日</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">部門</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">全部</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={refresh}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            查詢
          </button>
          <p className="text-slate-600">
            筆數：<span className="font-medium text-slate-800">{rows.length}</span>
          </p>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此條件下沒有營收資料。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 text-left font-medium text-slate-700">門市</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">部門</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">日期</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">營收金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">{r.storeName}</td>
                  <td className="px-4 py-2 text-slate-600">{r.department || "—"}</td>
                  <td className="px-4 py-2">{r.revenueDate}</td>
                  <td className="px-4 py-2 text-right">
                    {r.revenueAmount.toLocaleString("zh-TW")}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-2 text-right font-medium text-slate-700" colSpan={3}>
                  合計
                </td>
                <td className="px-4 py-2 text-right font-medium text-slate-700">
                  {totalRevenue.toLocaleString("zh-TW")}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

