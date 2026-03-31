"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  position: string | null;
  defaultStoreId: string | null;
  defaultStore?: { id: string; name: string; code: string | null; department: string | null } | null;
};

const REASON_OPTIONS = [
  { value: "MANAGER_MEETING", label: "店長會議" },
  { value: "PROMOTION_REVIEW", label: "晉升考核" },
  { value: "OTHER", label: "其他" },
];

export default function BatchWorkhourAdjustmentPage() {
  const [workDate, setWorkDate] = useState(() => formatLocalDateInput());
  const [reason, setReason] = useState("MANAGER_MEETING");
  const [hours, setHours] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [positionFilter, setPositionFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data: Employee[]) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]));
  }, []);

  const getDepartmentLabel = (e: Employee) =>
    (e.defaultStore?.department?.trim() || e.defaultStore?.name || "").trim() || "—";

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const label = getDepartmentLabel(e);
      if (label && label !== "—") set.add(label);
    }
    return Array.from(set).sort();
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    const dept = departmentFilter.trim();
    if (dept) {
      list = list.filter((e) => getDepartmentLabel(e) === dept);
    }
    const posQ = positionFilter.trim().toLowerCase();
    if (posQ) {
      list = list.filter(
        (e) => (e.position ?? "").toLowerCase().includes(posQ)
      );
    }
    return list;
  }, [employees, departmentFilter, positionFilter]);

  const hoursNum = useMemo(() => {
    const n = parseFloat(hours);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }, [hours]);

  const selectedCount = selectedIds.size;
  const selectAllFiltered = () => {
    setSelectedIds(
      new Set(filteredEmployees.map((e) => e.id))
    );
  };
  const clearAll = () => setSelectedIds(new Set());

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function submit() {
    setMessage(null);
    if (!hoursNum || hoursNum <= 0) {
      setMessage({ type: "err", text: "請輸入大於 0 的扣除時數" });
      return;
    }
    if (selectedIds.size === 0) {
      setMessage({ type: "err", text: "請至少選擇一位人員" });
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/workhour-adjustments/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workDate,
        adjustmentType: reason,
        adjustmentHours: hoursNum,
        employeeIds: Array.from(selectedIds),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error || "批次新增失敗" });
      return;
    }
    setMessage({
      type: "ok",
      text: `已批次新增 ${data.createdCount ?? 0} 筆工時調整；${data.skipped ? `略過 ${data.skipped} 筆` : ""}。`,
    });
    setSelectedIds(new Set());
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">批次調整工時</h1>
        <Link
          href="/workhour-related"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回工時異動相關
        </Link>
      </div>

      <p className="mb-4 text-sm text-slate-500">
        同一日期、同一原因、同一扣除時數時，可一次勾選多人批次寫入；會出現在人員出勤表中並計入小計。
      </p>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">日期</span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">原因</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">扣除時數</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="例：2"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-medium text-slate-800">人員</h2>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">部門</span>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">全部</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">職稱</span>
          <input
            type="text"
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            placeholder="例：店長"
            className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={selectAllFiltered}
          className="rounded border border-sky-600 bg-sky-50 px-3 py-1 text-sm text-sky-700 hover:bg-sky-100"
        >
          {(departmentFilter || positionFilter.trim()) ? "勾選篩選後全部" : "全選"}
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          全部取消
        </button>
        <span className="text-sm text-slate-500">
          已選 {selectedCount} 人
          {(departmentFilter || positionFilter.trim()) && `（篩選後 ${filteredEmployees.length} 人）`}
        </span>
      </div>

      <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="w-10 px-2 py-2 text-left"></th>
              <th className="px-2 py-2 text-left font-medium text-slate-700">工號</th>
              <th className="px-2 py-2 text-left font-medium text-slate-700">姓名</th>
              <th className="px-2 py-2 text-left font-medium text-slate-700">部門</th>
              <th className="px-2 py-2 text-left font-medium text-slate-700">職稱</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-center text-slate-500">
                  {(departmentFilter || positionFilter.trim()) ? "篩選後無人員" : "尚無人員資料"}
                </td>
              </tr>
            ) : (
              filteredEmployees.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-2 py-1.5">{e.employeeCode}</td>
                  <td className="px-2 py-1.5">{e.name}</td>
                  <td className="px-2 py-1.5 text-slate-600">{getDepartmentLabel(e)}</td>
                  <td className="px-2 py-1.5 text-slate-600">{e.position ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={submitting || selectedCount === 0 || !hoursNum}
          className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {submitting ? "送出中…" : "批次送出"}
        </button>
        {message && (
          <p
            className={
              message.type === "ok"
                ? "text-sm text-green-600"
                : "text-sm text-red-600"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
