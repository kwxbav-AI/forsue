"use client";

import { useEffect, useState, useCallback } from "react";

type Store = { id: string; name: string };
type Employee = { id: string; name: string; employeeCode: string };

type TransferRecord = {
  id: string;
  employee: Employee;
  fromStore: Store;
  toStore: Store;
  transferDate: string;
  endDate: string | null;
  allowanceType: "management" | "staff" | "parttime";
  baseMonthlyAmount: number;
  notes: string | null;
  createdAt: string;
};

type AllowanceRow = {
  id: string;
  employee: Employee;
  fromStore: Store;
  toStore: Store;
  transferDate: string;
  endDate: string | null;
  allowanceType: string;
  baseMonthlyAmount: number;
  nthMonth: number;
  periodStart: string;
  periodEnd: string;
  isPartialMonth: boolean;
  totalWeekdays: number;
  periodWeekdays: number;
  attendedDays: number;
  attendanceRate: number;
  isEligible: boolean;
  amount: number;
  notes: string | null;
};

const ALLOWANCE_TYPES = [
  { value: "management", label: "店長/副店長（3000）" },
  { value: "staff", label: "營業員（2000）" },
  { value: "parttime", label: "兼職（2000×比例）" },
];

const BASE_AMOUNTS: Record<string, number> = {
  management: 3000,
  staff: 2000,
  parttime: 2000,
};

function formatDate(s: string) {
  return s.replace(/-/g, "/");
}

export default function StoreTransferPage() {
  const [tab, setTab] = useState<"records" | "allowance">("records");
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);

  // 新增表單
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    fromStoreId: "",
    toStoreId: "",
    transferDate: "",
    endDate: "",
    allowanceType: "staff" as "management" | "staff" | "parttime",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // 月結算
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [allowanceRows, setAllowanceRows] = useState<AllowanceRow[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  // 載入員工與門市清單
  useEffect(() => {
    fetch("/api/promotion-tracking")
      .then((r) => r.json())
      .then((rows: { employeeId: string; employeeName: string }[]) => {
        setEmployees(
          rows.map((r) => ({ id: r.employeeId, name: r.employeeName, employeeCode: "" }))
        );
      })
      .catch(() => {});

    fetch("/api/stores")
      .then((r) => r.json())
      .then((rows: Store[]) => setStores(rows))
      .catch(() => {});
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/store-transfer");
      setRecords(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "records") loadRecords();
  }, [tab, loadRecords]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const baseMonthlyAmount = BASE_AMOUNTS[form.allowanceType];
      const r = await fetch("/api/store-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: form.employeeId,
          fromStoreId: form.fromStoreId,
          toStoreId: form.toStoreId,
          transferDate: form.transferDate,
          endDate: form.endDate || null,
          allowanceType: form.allowanceType,
          baseMonthlyAmount,
          notes: form.notes || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json();
        setFormError(JSON.stringify(j.error));
        return;
      }
      setShowForm(false);
      setForm({ employeeId: "", fromStoreId: "", toStoreId: "", transferDate: "", endDate: "", allowanceType: "staff", notes: "" });
      loadRecords();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定刪除這筆調店紀錄？")) return;
    await fetch(`/api/store-transfer/${id}`, { method: "DELETE" });
    loadRecords();
  }

  async function handleSetEndDate(id: string) {
    const d = prompt("設定調任迄日（YYYY-MM-DD），留空表示長期調任：");
    if (d === null) return;
    await fetch(`/api/store-transfer/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate: d || null }),
    });
    loadRecords();
  }

  async function handleCalc() {
    setCalcLoading(true);
    try {
      const r = await fetch(`/api/store-transfer/allowance?month=${month}`);
      setAllowanceRows(await r.json());
    } finally {
      setCalcLoading(false);
    }
  }

  function exportCsv() {
    const header = ["員工", "原屬門市", "調任門市", "調任起日", "第幾月", "計算期間", "工作天", "出勤天", "出勤率", "達標", "應發津貼", "備註"];
    const rows = allowanceRows.map((r) => [
      r.employee.name,
      r.fromStore.name,
      r.toStore.name,
      formatDate(r.transferDate),
      `第${r.nthMonth}月`,
      `${formatDate(r.periodStart)}～${formatDate(r.periodEnd)}`,
      r.periodWeekdays,
      r.attendedDays,
      `${r.attendanceRate}%`,
      r.isEligible ? "是" : "否",
      r.amount,
      r.notes ?? "",
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `調店津貼_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">調店津貼管理</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(["records", "allowance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-b-2 border-sky-600 text-sky-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "records" ? "異動紀錄" : "月結算"}
          </button>
        ))}
      </div>

      {/* Tab: 異動紀錄 */}
      {tab === "records" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">登錄因公司安排調任的員工，系統依此計算每月調店津貼。</p>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
            >
              {showForm ? "取消" : "+ 新增紀錄"}
            </button>
          </div>

          {/* 新增表單 */}
          {showForm && (
            <form onSubmit={handleSubmit} className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">員工</span>
                  <select
                    required
                    value={form.employeeId}
                    onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">選擇員工</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">津貼類別</span>
                  <select
                    value={form.allowanceType}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        allowanceType: e.target.value as "management" | "staff" | "parttime",
                      }))
                    }
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {ALLOWANCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">原屬門市</span>
                  <select
                    required
                    value={form.fromStoreId}
                    onChange={(e) => setForm((f) => ({ ...f, fromStoreId: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">選擇門市</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">調任門市</span>
                  <select
                    required
                    value={form.toStoreId}
                    onChange={(e) => setForm((f) => ({ ...f, toStoreId: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">選擇門市</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">調任起日</span>
                  <input
                    type="date"
                    required
                    value={form.transferDate}
                    onChange={(e) => setForm((f) => ({ ...f, transferDate: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">調任迄日（選填，長期調任留空）</span>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-slate-700">備註（選填）</span>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    placeholder="例：自願調任、試用期等"
                  />
                </label>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {saving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </form>
          )}

          {/* 紀錄列表 */}
          {loading ? (
            <p className="text-sm text-slate-400">載入中…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">尚無調店津貼紀錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                    <th className="px-3 py-2 font-medium">員工</th>
                    <th className="px-3 py-2 font-medium">原屬門市</th>
                    <th className="px-3 py-2 font-medium">調任門市</th>
                    <th className="px-3 py-2 font-medium">調任起日</th>
                    <th className="px-3 py-2 font-medium">調任迄日</th>
                    <th className="px-3 py-2 font-medium">類別</th>
                    <th className="px-3 py-2 font-medium">月津貼</th>
                    <th className="px-3 py-2 font-medium">備註</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{r.employee.name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.fromStore.name}</td>
                      <td className="px-3 py-2 text-slate-600">{r.toStore.name}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(r.transferDate)}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {r.endDate ? formatDate(r.endDate) : <span className="text-slate-400">長期</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {ALLOWANCE_TYPES.find((t) => t.value === r.allowanceType)?.label.split("（")[0]}
                      </td>
                      <td className="px-3 py-2 font-variant-numeric text-slate-700">
                        {r.allowanceType === "parttime" ? "依比例" : `$${r.baseMonthlyAmount}`}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[150px] truncate">{r.notes}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSetEndDate(r.id)}
                            className="text-xs text-sky-600 hover:underline"
                          >
                            設定迄日
                          </button>
                          <button
                            onClick={() => handleDelete(r.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: 月結算 */}
      {tab === "allowance" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">計算月份</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleCalc}
              disabled={calcLoading}
              className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {calcLoading ? "計算中…" : "計算"}
            </button>
            {allowanceRows.length > 0 && (
              <button
                onClick={exportCsv}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                匯出 CSV
              </button>
            )}
          </div>

          {allowanceRows.length > 0 && (
            <>
              <div className="rounded bg-slate-50 border border-slate-200 px-4 py-2 text-sm text-slate-600">
                合計應發：<span className="font-semibold text-slate-800">
                  ${allowanceRows.filter((r) => r.isEligible).reduce((s, r) => s + r.amount, 0).toLocaleString()}
                </span>
                　共 {allowanceRows.filter((r) => r.isEligible).length} 人
                {allowanceRows.some((r) => !r.isEligible) && (
                  <span className="ml-3 text-amber-600">
                    （另有 {allowanceRows.filter((r) => !r.isEligible).length} 人出勤率未達標，不發放）
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-3 py-2 font-medium">員工</th>
                      <th className="px-3 py-2 font-medium">調任</th>
                      <th className="px-3 py-2 font-medium">第幾月</th>
                      <th className="px-3 py-2 font-medium">計算期間</th>
                      <th className="px-3 py-2 font-medium text-right">工作天</th>
                      <th className="px-3 py-2 font-medium text-right">出勤天</th>
                      <th className="px-3 py-2 font-medium text-right">出勤率</th>
                      <th className="px-3 py-2 font-medium text-center">達標</th>
                      <th className="px-3 py-2 font-medium text-right">應發津貼</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allowanceRows.map((r) => (
                      <tr key={r.id} className={r.isEligible ? "hover:bg-slate-50" : "bg-amber-50 hover:bg-amber-100"}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.employee.name}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {r.fromStore.name}→{r.toStore.name}
                        </td>
                        <td className="px-3 py-2 text-slate-600">第 {r.nthMonth} 月</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">
                          {formatDate(r.periodStart)}
                          {r.isPartialMonth && `～${formatDate(r.periodEnd)}`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.periodWeekdays}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.attendedDays}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.attendanceRate >= 90 ? "text-green-700" : "text-red-600"}`}>
                          {r.attendanceRate}%
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.isEligible ? (
                            <span className="inline-block rounded-full bg-green-100 px-2 text-xs text-green-700">是</span>
                          ) : (
                            <span className="inline-block rounded-full bg-red-100 px-2 text-xs text-red-600">否</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                          {r.isEligible ? `$${r.amount.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {allowanceRows.length === 0 && !calcLoading && (
            <p className="text-sm text-slate-400 py-8 text-center">
              選擇月份後點「計算」查看結果
            </p>
          )}
        </div>
      )}
    </div>
  );
}
