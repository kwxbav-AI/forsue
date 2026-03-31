"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type Store = { id: string; code: string | null; name: string; isActive?: boolean };
type Employee = { id: string; employeeCode: string; name: string; defaultStoreId: string | null };
type Adjustment = {
  id: string;
  workDate: string;
  employeeId: string;
  storeId: string | null;
  adjustmentType: string;
  adjustmentHours: number;
  reason: string | null;
  note: string | null;
  employee: { employeeCode: string; name: string };
};

const ADJUSTMENT_TYPES = [
  { value: "MANAGER_MEETING", label: "店長會議" },
  { value: "PROMOTION_REVIEW", label: "晉升考核" },
];

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  STAFF_SHORTAGE: "人力不足",
  MEETING_REVIEW: "會議/考核",
  RESERVE_STAFF: "儲備人力",
  TRIAL: "試作",
  MANAGER_MEETING: "店長會議",
  PROMOTION_REVIEW: "晉升考核",
  OTHER: "其他",
};

export default function WorkhourAdjustmentsPage() {
  const [date, setDate] = useState(() => formatLocalDateInput());
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<"add" | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [employeeWorkHours, setEmployeeWorkHours] = useState<number | null>(null);
  const [employeeClock, setEmployeeClock] = useState<{ startTime: string | null; endTime: string | null; department: string | null } | null>(null);
  const [form, setForm] = useState({
    employeeId: "",
    storeId: "",
    adjustmentType: "MANAGER_MEETING",
    adjustmentHours: 0,
    note: "",
  });

  const fetchStores = useCallback(async () => {
    const res = await fetch("/api/stores");
    if (res.ok) setStores(await res.json());
  }, []);
  const fetchEmployees = useCallback(async () => {
    const res = await fetch("/api/employees");
    if (res.ok) setEmployees(await res.json());
  }, []);
  const fetchAdjustments = useCallback(async () => {
    setLoading(true);
    let url = `/api/workhour-adjustments?date=${date}`;
    if (storeId) url += `&storeId=${storeId}`;
    const res = await fetch(url);
    if (res.ok) setAdjustments(await res.json());
    setLoading(false);
  }, [date, storeId]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);
  const activeStores = useMemo(
    () => stores.filter((s) => s.isActive !== false),
    [stores]
  );
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);
  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const q = employeeSearch.trim().toLowerCase();
    return employees.filter(
      (e) =>
        e.employeeCode.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
    );
  }, [employees, employeeSearch]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === form.employeeId),
    [employees, form.employeeId]
  );

  useEffect(() => {
    if (modal !== "add" || !date || !form.employeeId) {
      setEmployeeWorkHours(null);
      setEmployeeClock(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/performance/daily/employee-hours?date=${date}&employeeId=${form.employeeId}`
      );
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) {
        setEmployeeWorkHours(data.workHours ?? 0);
        setEmployeeClock({
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          department: data.department ?? null,
        });
        if (data.storeId) setForm((f) => ({ ...f, storeId: data.storeId }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modal, date, form.employeeId]);

  async function submitAdd() {
    const res = await fetch("/api/workhour-adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workDate: date,
        employeeId: form.employeeId,
        storeId: form.storeId || null,
        adjustmentType: form.adjustmentType,
        adjustmentHours: Number.isFinite(Number(form.adjustmentHours)) ? Number(form.adjustmentHours) : 0,
        reason: null,
        note: form.note || null,
      }),
    });
    if (res.ok) {
      setModal(null);
      setEmployeeSearch("");
      setEmployeeDropdownOpen(false);
      setForm({ employeeId: "", storeId: "", adjustmentType: "MANAGER_MEETING", adjustmentHours: 0, note: "" });
      fetchAdjustments();
    } else {
      const data = await res.json();
      alert(data.error || "儲存失敗");
    }
  }

  async function deleteAdj(id: string) {
    if (!confirm("確定刪除此筆異動？")) return;
    const res = await fetch(`/api/workhour-adjustments/${id}`, { method: "DELETE" });
    if (res.ok) fetchAdjustments();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">工時異動調整</h1>
        <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          回首頁
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">日期</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">門市</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部</option>
            {activeStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setModal("add");
            setEmployeeSearch("");
            setEmployeeDropdownOpen(false);
          }}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
        >
          新增異動
        </button>
      </div>

      {modal === "add" && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 font-medium text-slate-800">新增工時異動</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-600">員工</span>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={employeeDropdownOpen ? employeeSearch : selectedEmployee ? `${selectedEmployee.employeeCode} ${selectedEmployee.name}` : ""}
                    onChange={(e) => {
                      setEmployeeSearch(e.target.value);
                      setEmployeeDropdownOpen(true);
                      if (!e.target.value) setForm((f) => ({ ...f, employeeId: "" }));
                    }}
                    onFocus={() => {
                      setEmployeeDropdownOpen(true);
                      if (selectedEmployee) setEmployeeSearch(`${selectedEmployee.employeeCode} ${selectedEmployee.name}`);
                    }}
                    onBlur={() => setTimeout(() => setEmployeeDropdownOpen(false), 180)}
                    placeholder="請搜尋或選擇員工（代碼、姓名）"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {employeeDropdownOpen && (
                    <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg">
                      {filteredEmployees.length === 0 ? (
                        <li className="px-2 py-2 text-sm text-slate-500">無符合的員工</li>
                      ) : (
                        filteredEmployees.map((e) => (
                          <li
                            key={e.id}
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              setForm((f) => ({ ...f, employeeId: e.id }));
                              setEmployeeSearch("");
                              setEmployeeDropdownOpen(false);
                            }}
                            className="cursor-pointer px-2 py-1.5 text-sm hover:bg-slate-100"
                          >
                            {e.employeeCode} {e.name}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </label>
              {form.employeeId && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      當天上班時數：
                      <span className="ml-1 font-medium text-slate-900">
                        {employeeWorkHours != null ? `${employeeWorkHours} 小時` : "載入中…"}
                      </span>
                    </span>
                    <span className="text-slate-600">
                      打卡：
                      <span className="ml-1 font-medium text-slate-900">
                        {employeeClock
                          ? `${employeeClock.startTime || "—"} ~ ${employeeClock.endTime || "—"}`
                          : "載入中…"}
                      </span>
                    </span>
                  </div>
                  {employeeClock?.department && (
                    <div className="mt-1 text-slate-600">
                      出勤部門：<span className="font-medium text-slate-900">{employeeClock.department}</span>（已自動帶入門市）
                    </div>
                  )}
                </div>
              )}
              <label className="block">
                <span className="text-sm text-slate-600">門市（選填）</span>
                <select
                  value={form.storeId}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                {activeStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">類型</span>
                <select
                  value={form.adjustmentType}
                  onChange={(e) => setForm((f) => ({ ...f, adjustmentType: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {ADJUSTMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">調整時數（可負數）</span>
                <input
                  type="number"
                  step="0.5"
                  value={form.adjustmentHours || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, adjustmentHours: parseFloat(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">備註</span>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitAdd}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : adjustments.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此日期無工時異動</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 text-left font-medium text-slate-700">員工</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">類型</th>
                <th className="px-4 py-2 text-right font-medium text-slate-700">調整時數</th>
                <th className="px-4 py-2 text-left font-medium text-slate-700">備註</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">
                    {a.employee.employeeCode} {a.employee.name}
                  </td>
                  <td className="px-4 py-2">
                    {ADJUSTMENT_TYPE_LABELS[a.adjustmentType] ?? a.adjustmentType}
                  </td>
                  <td className="px-4 py-2 text-right">{a.adjustmentHours}</td>
                  <td className="px-4 py-2 text-slate-600">{a.note ?? "—"}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => deleteAdj(a.id)}
                      className="text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
