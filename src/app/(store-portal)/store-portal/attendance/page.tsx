"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type StoreContext = {
  storeName: string;
  performanceStoreId: string | null;
};

type AttendanceRow = {
  type: string;
  id: string;
  employeeId: string;
  name: string;
  workDate: string;
  workHours: number;
  startTime: string | null;
  endTime: string | null;
  department: string;
  clockStatus?: string;
};

type SortField = "workDate" | "name";
type SortDir = "asc" | "desc";

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(t: string | null) {
  if (!t) return "—";
  return t.slice(0, 5);
}

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (field !== sortField) return <ChevronsUpDown size={11} className="ml-0.5 text-slate-300" />;
  return sortDir === "asc"
    ? <ChevronUp size={11} className="ml-0.5 text-emerald-500" />
    : <ChevronDown size={11} className="ml-0.5 text-emerald-500" />;
}

export default function StoreAttendancePage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("workDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = toYmd(now);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!ctxRef.current) {
        const ctxUrl = adminStoreId
          ? `/api/store-portal/context?storeId=${encodeURIComponent(adminStoreId)}`
          : "/api/store-portal/context";
        const res = await fetch(ctxUrl);
        if (!res.ok) throw new Error("無法取得門市資訊");
        ctxRef.current = (await res.json()) as StoreContext;
      }
      const storeCtx = ctxRef.current;

      const params = new URLSearchParams({ startDate: monthStart, endDate: today });
      if (storeCtx.storeName) params.set("department", storeCtx.storeName);

      const attRes = await fetch(`/api/reports/attendance?${params.toString()}`);
      if (!attRes.ok) throw new Error("出勤資料載入失敗");
      const data = await attRes.json();
      const rawRows: AttendanceRow[] = (data.rows ?? []).filter(
        (r: AttendanceRow) => r.type === "attendance" && r.workDate >= monthStart
      );
      setRows(rawRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, monthStart, today]);

  useEffect(() => {
    ctxRef.current = null;
    void load();
  }, [adminStoreId]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortField === "workDate") {
      cmp = a.workDate.localeCompare(b.workDate);
      if (cmp === 0) cmp = a.name.localeCompare(b.name, "zh-TW");
    } else {
      cmp = a.name.localeCompare(b.name, "zh-TW");
      if (cmp === 0) cmp = a.workDate.localeCompare(b.workDate);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalHours = rows.reduce((a, r) => a + (r.workHours ?? 0), 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-sm font-medium text-slate-800">出勤紀錄</h1>
          <p className="text-xs text-slate-400">
            {now.getFullYear()}年{now.getMonth() + 1}月 · {monthStart} – {today}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">本月總工時</p>
              <p className="text-lg font-medium text-slate-800">{totalHours.toFixed(1)}h</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">出勤天數（筆）</p>
              <p className="text-lg font-medium text-slate-800">{rows.length}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">日均工時</p>
              <p className="text-lg font-medium text-slate-800">
                {rows.length > 0 ? (totalHours / rows.length).toFixed(1) : "—"}h
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">
            此月份無出勤紀錄
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort("workDate")}
                      className="flex items-center text-[10px] font-medium text-slate-400 hover:text-slate-600"
                    >
                      日期
                      <SortIcon field="workDate" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="flex items-center text-[10px] font-medium text-slate-400 hover:text-slate-600"
                    >
                      員工
                      <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                    </button>
                  </th>
                  {(["上班", "下班", "工時", "備註"] as const).map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{r.workDate}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{r.name}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtTime(r.startTime)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtTime(r.endTime)}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {r.workHours?.toFixed(2)}h
                    </td>
                    <td className="px-3 py-2">
                      {r.clockStatus === "anomaly" && (
                        <span className="rounded bg-red-50 px-1.5 py-px text-[9px] font-medium text-red-600">
                          異常
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
