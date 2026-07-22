"use client";

import { useState } from "react";
import Link from "next/link";

type StoreOption = { id: string; name: string };

type AuditRow = {
  attendanceId: string;
  workDate: string;
  employeeCode: string;
  employeeName: string;
  defaultStoreId: string | null;
  defaultStoreName: string | null;
  clockInStoreId: string | null;
  clockInStoreName: string | null;
  workHours: number;
};

type AuditResult = {
  startDate: string;
  endDate: string;
  stores: StoreOption[];
  missingDispatch: AuditRow[];
  total: number;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function DispatchAuditPage() {
  const [startDate, setStartDate] = useState(firstOfMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [defaultStoreId, setDefaultStoreId] = useState("");
  const [workedStoreId, setWorkedStoreId] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleQuery() {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (defaultStoreId) params.set("defaultStoreId", defaultStoreId);
      if (workedStoreId) params.set("workedStoreId", workedStoreId);
      const res = await fetch(`/api/dispatch-audit?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "查詢失敗");
      }
      const data: AuditResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setLoading(false);
    }
  }

  const storeOptions = result?.stores ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">調度稽核</h1>
        <Link
          href="/workhour-related"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          返回
        </Link>
      </div>

      <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        稽核邏輯：出勤紀錄的出勤門市與員工本店不同，且同日期查無調度填報，即列為「疑似漏填」。
      </div>

      {/* 篩選列 */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">開始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">結束日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">本店（員工所屬門市）</label>
          <select
            value={defaultStoreId}
            onChange={(e) => setDefaultStoreId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">全部</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">實際出勤門市</label>
          <select
            value={workedStoreId}
            onChange={(e) => setWorkedStoreId(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">全部</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleQuery}
          disabled={loading}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {loading ? "查詢中…" : "查詢"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-medium text-slate-800">疑似漏填調度</span>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-sm font-medium text-orange-700">
              共 {result.total} 筆
            </span>
          </div>

          {result.missingDispatch.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              此區間無疑似漏填調度紀錄
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-2 text-left font-medium">日期</th>
                    <th className="whitespace-nowrap px-4 py-2 text-left font-medium">員工</th>
                    <th className="whitespace-nowrap px-4 py-2 text-left font-medium">本店</th>
                    <th className="whitespace-nowrap px-4 py-2 text-left font-medium">實際出勤門市</th>
                    <th className="whitespace-nowrap px-4 py-2 text-right font-medium">工時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.missingDispatch.map((row) => (
                    <tr key={row.attendanceId} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 text-slate-700">{row.workDate}</td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="font-medium text-slate-800">{row.employeeName}</span>
                        <span className="ml-1.5 text-slate-400">{row.employeeCode}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                        {row.defaultStoreName ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="rounded bg-orange-50 px-2 py-0.5 text-orange-700">
                          {row.clockInStoreName ?? row.clockInStoreId ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-slate-700">
                        {row.workHours}h
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
          請選擇日期區間後按「查詢」
        </div>
      )}
    </div>
  );
}
