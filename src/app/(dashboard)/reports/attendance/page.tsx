"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type AttendanceReportRow = {
  type: "attendance" | "adjustment" | "dispatch_out" | "dispatch_in" | "subtotal";
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  position: string;
  workDate: string;
  workHours: number;
  adjustmentReason: string | null;
};

type Store = {
  id: string;
  name: string;
  isActive?: boolean;
  department?: string | null;
};

export default function AttendanceReportPage() {
  const todayStr = formatLocalDateInput();

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [department, setDepartment] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");

  const [rows, setRows] = useState<AttendanceReportRow[]>([]);
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
      const dept = (s.department || "").trim();
      if (dept) set.add(dept);
    }
    return Array.from(set).sort();
  }, [stores]);

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    if (department) params.set("department", department);
    if (employeeCode.trim()) params.set("employeeCode", employeeCode.trim());
    if (name.trim()) params.set("name", name.trim());

    const res = await fetch(`/api/reports/attendance?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as AttendanceReportRow[];
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

  const totalHours = useMemo(() => {
    return rows.reduce((sum, r) => {
      if (r.type === "subtotal" || r.type === "dispatch_in") return sum + (Number.isFinite(r.workHours) ? r.workHours : 0);
      if (r.type === "attendance") {
        const hasSubtotal = rows.some(
          (x) => x.type === "subtotal" && x.workDate === r.workDate && x.employeeCode === r.employeeCode
        );
        if (!hasSubtotal) return sum + (Number.isFinite(r.workHours) ? r.workHours : 0);
      }
      return sum;
    }, 0);
  }, [rows]);

  const rowCount = useMemo(() => {
    return rows.filter((r) => r.type === "attendance" || r.type === "dispatch_in").length;
  }, [rows]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">人員出勤表</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">員工編號</span>
              <input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="可模糊查詢"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">姓名</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="可模糊查詢"
              />
            </label>
          </div>
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
            筆數：<span className="font-medium text-slate-800">{rowCount}</span>，總工時：
            <span className="font-medium text-slate-800">{totalHours.toLocaleString("zh-TW")}</span>
          </p>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此條件下沒有出勤資料。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 text-left font-medium text-slate-700">員工編號</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">姓名</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">部門</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">職稱</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">日期</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">工時</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">調整事由</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isChangeRow =
                  r.type === "adjustment" || r.type === "dispatch_out" || r.type === "dispatch_in";
                const isSubRow = isChangeRow || r.type === "subtotal";
                const isSubtotal = r.type === "subtotal";
                const isNegative = Number.isFinite(r.workHours) && r.workHours < 0;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 ${
                      isSubtotal ? "bg-slate-50 font-medium" : ""
                    } ${isChangeRow ? "bg-amber-50 text-slate-700" : ""} ${
                      !isSubtotal && !isChangeRow && isSubRow ? "text-slate-600" : ""
                    }`}
                  >
                    <td className="px-4 py-2">
                      {isSubtotal ? "小計" : isSubRow ? "" : r.employeeCode}
                    </td>
                    <td className="px-4 py-2">{!isSubRow && !isSubtotal ? r.name : ""}</td>
                    <td className="px-4 py-2">{isSubRow && !isSubtotal ? "" : (r.department || "—")}</td>
                    <td className="px-4 py-2">{isSubRow && !isSubtotal ? "" : (r.position || "—")}</td>
                    <td className="px-4 py-2">{isSubRow && !isSubtotal ? "" : r.workDate}</td>
                    <td className={`px-4 py-2 text-right ${isNegative ? "font-medium text-red-700" : ""}`}>
                      {r.workHours}
                    </td>
                    <td className="px-4 py-2">{r.adjustmentReason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
