"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import { PendingDeletionPanel } from "@/components/pending-deletion-panel";

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
  const todayStr = formatLocalDateInput();

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [department, setDepartment] = useState("");
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [perm, setPerm] = useState({ canReadPending: false, canApprove: false });
  const [pendingRefresh, setPendingRefresh] = useState(0);

  const [stores, setStores] = useState<Store[]>([]);

  const refresh = useCallback(async () => {
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
  }, [startDate, endDate, department]);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: Store[]) => setStores(d))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setPerm({
          canReadPending: Boolean(d?.user?.canReadPendingRevenueRecords),
          canApprove: Boolean(d?.user?.canApproveDeleteRevenueRecords),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onPending = () => {
      refresh();
      setPendingRefresh((k) => k + 1);
    };
    window.addEventListener("pending-deletions-changed", onPending);
    return () => window.removeEventListener("pending-deletions-changed", onPending);
  }, [refresh]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      if (s.department) set.add(s.department);
    }
    return Array.from(set).sort();
  }, [stores]);

  const totalRevenue = useMemo(
    () => rows.reduce((sum, r) => sum + (r.revenueAmount || 0), 0),
    [rows]
  );

  async function deleteRow(row: RevenueRow) {
    if (deletingIds.has(row.id)) {
      setMessage({ type: "err", text: "刪除申請送出中，請稍候…" });
      return;
    }
    const label = `${row.storeName}｜${row.revenueDate}｜${row.revenueAmount.toLocaleString("zh-TW")} 元`;
    if (!confirm(`確定刪除此筆營收？\n${label}`)) return;

    setDeletingIds((s) => new Set(s).add(row.id));
    try {
      const res = await fetch(`/api/reports/revenue/${row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setMessage({
          type: "ok",
          text: data.message || "已送出刪除申請，待核准後生效",
        });
        setPendingRefresh((k) => k + 1);
        await refresh();
        return;
      }
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "刪除失敗" });
        return;
      }
      setMessage({ type: "ok", text: "已刪除，該日績效已重算" });
      setPendingRefresh((k) => k + 1);
      await refresh();
    } finally {
      setDeletingIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }

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

      <PendingDeletionPanel
        segment="revenue-records"
        canRead={perm.canReadPending}
        canApprove={perm.canApprove}
        title="待審刪除申請（營收）"
        refreshKey={pendingRefresh}
      />

      <p className="mb-4 text-sm text-slate-500">
        刪除營收後會自動重算該日每日績效。若無「刪除核定」權限，刪除將送出待審申請。
      </p>

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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => refresh()}
              className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
            >
              查詢
            </button>
            {message && (
              <span
                className={
                  message.type === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"
                }
              >
                {message.text}
              </span>
            )}
          </div>
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
                <th className="sticky left-0 z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                  門市
                </th>
                <th className="sticky left-[160px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                  部門
                </th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">日期</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">營收金額</th>
                <th className="w-[72px] min-w-[72px] px-4 py-2 text-center font-medium text-slate-700">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-[5] w-[160px] min-w-[160px] bg-white px-4 py-2">
                    {r.storeName}
                  </td>
                  <td className="sticky left-[160px] z-[5] w-[140px] min-w-[140px] bg-white px-4 py-2 text-slate-600">
                    {r.department || "—"}
                  </td>
                  <td className="px-4 py-2">{r.revenueDate}</td>
                  <td className="px-4 py-2 text-right">
                    {r.revenueAmount.toLocaleString("zh-TW")}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => deleteRow(r)}
                      disabled={deletingIds.has(r.id)}
                      className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingIds.has(r.id) ? "處理中…" : "刪除"}
                    </button>
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
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
