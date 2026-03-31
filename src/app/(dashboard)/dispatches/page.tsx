"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type Store = { id: string; code: string | null; name: string; aliases?: string[]; isActive?: boolean };
type Employee = { id: string; employeeCode: string; name: string };

type DispatchRow = {
  id: string;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  fromStoreId: string | null;
  toStoreId: string;
  fromStoreName: string | null;
  toStoreName: string | null;
  dispatchHours: number;
  actualHours: number | null;
  confirmStatus: string | null;
  effectiveHours: number;
  hoursDiff: number | null;
  attendanceHours: number | null;
  comparisonResult: "待比對" | "一致" | "延長" | "縮短";
  startTime: string | null;
  endTime: string | null;
  remark: string | null;
};

const DISPATCH_REASONS = [
  "人力支援",
  "跨店學習",
  "後勤支援門市",
  "門市支援客服",
] as const;

function minutesDiff(start: string, end: string): number | null {
  const m1 = start.match(/^(\d{1,2}):(\d{2})$/);
  const m2 = end.match(/^(\d{1,2}):(\d{2})$/);
  if (!m1 || !m2) return null;
  const s = Number(m1[1]) * 60 + Number(m1[2]);
  const e = Number(m2[1]) * 60 + Number(m2[2]);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return e - s;
}

export default function DispatchesPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [startDate, setStartDate] = useState(() => formatLocalDateInput());
  const [endDate, setEndDate] = useState(() => formatLocalDateInput());
  const [list, setList] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [editRow, setEditRow] = useState<DispatchRow | null>(null);
  const [editActualHours, setEditActualHours] = useState("");
  const [editConfirmStatus, setEditConfirmStatus] = useState<string>("待確認");
  const [editRemark, setEditRemark] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  type DispatchReason = (typeof DISPATCH_REASONS)[number];

  const [form, setForm] = useState<{
    employeeId: string;
    toStoreId: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    reason: DispatchReason;
    note: string;
  }>({
    employeeId: "",
    toStoreId: "",
    startDate: formatLocalDateInput(),
    endDate: formatLocalDateInput(),
    startTime: "13:00",
    endTime: "19:00",
    reason: DISPATCH_REASONS[0],
    note: "",
  });

  async function refresh() {
    setLoading(true);
    const res = await fetch(`/api/dispatches?startDate=${startDate}&endDate=${endDate}`);
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => setStores(d))
      .catch(() => setStores([]));
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    refresh();
  }, [startDate, endDate]);

  const activeStores = useMemo(
    () => stores.filter((s) => s.isActive !== false),
    [stores]
  );

  const hoursPreview = useMemo(() => {
    const diff = minutesDiff(form.startTime, form.endTime);
    if (diff == null || diff <= 0) return null;
    return Math.round((diff / 60) * 100) / 100;
  }, [form.startTime, form.endTime]);

  const selectedEmployee = useMemo(() => {
    if (!form.employeeId) return null;
    return employees.find((e) => e.id === form.employeeId) ?? null;
  }, [employees, form.employeeId]);

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees
      .filter((e) => {
        const code = e.employeeCode?.toLowerCase() ?? "";
        const name = e.name?.toLowerCase() ?? "";
        return code.includes(q) || name.includes(q);
      })
      .slice(0, 50);
  }, [employees, employeeQuery]);

  async function submit() {
    setMessage(null);
    const res = await fetch("/api/dispatches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: form.employeeId,
        toStoreId: form.toStoreId,
        startDate: form.startDate,
        endDate: form.endDate,
        startTime: form.startTime,
        endTime: form.endTime,
        remark: form.note
          ? `${form.reason} / ${form.note}`
          : form.reason,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "送出失敗");
      return;
    }
    setMessage(`已建立調度：${data.createdCount ?? 0} 筆`);
    setForm((f) => ({ ...f, reason: DISPATCH_REASONS[0], note: "" }));
    refresh();
  }

  async function deleteRow(id: string) {
    if (!confirm("確定刪除此筆調度？")) return;
    const res = await fetch(`/api/dispatches/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "刪除失敗");
      return;
    }
    refresh();
  }

  function openEdit(row: DispatchRow) {
    setEditRow(row);
    setEditActualHours(row.actualHours != null ? String(row.actualHours) : "");
    setEditConfirmStatus(row.confirmStatus === "已確認" ? "已確認" : "待確認");
    setEditRemark(row.remark ?? "");
  }

  async function saveEdit() {
    if (!editRow) return;
    const actual = editActualHours.trim() ? parseFloat(editActualHours) : null;
    if (editActualHours.trim() && (Number.isNaN(actual) || actual! < 0)) {
      setMessage("實際時數請輸入大於等於 0 的數字");
      return;
    }
    setEditSaving(true);
    setMessage(null);
    const res = await fetch(`/api/dispatches/${editRow.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actualHours: actual,
        confirmStatus: editConfirmStatus,
        remark: editRemark.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setEditSaving(false);
    if (!res.ok) {
      setMessage(data.error || "更新失敗");
      return;
    }
    setEditRow(null);
    setMessage("已更新實際時數與確認狀態");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">人員調度填報</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-800">新增調度</h2>
        <p className="mb-3 text-sm text-slate-500">
          C、D 欄為日期（可用月曆選擇）；H 欄拆成「支援起始時間 / 支援結束時間」，系統會自動換算調度時數。
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="text-sm text-slate-600">員工</span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => setEmployeeOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm"
              >
                <span className={selectedEmployee ? "text-slate-800" : "text-slate-400"}>
                  {selectedEmployee
                    ? `${selectedEmployee.employeeCode} ${selectedEmployee.name}`
                    : "請選擇"}
                </span>
                <span className="text-slate-400">▾</span>
              </button>
              {employeeOpen && (
                <div
                  className="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white shadow"
                  onBlur={(e) => {
                    // 若焦點離開整個容器才關閉
                    const currentTarget = e.currentTarget;
                    requestAnimationFrame(() => {
                      if (!currentTarget.contains(document.activeElement)) setEmployeeOpen(false);
                    });
                  }}
                  tabIndex={-1}
                >
                  <div className="p-2">
                    <input
                      autoFocus
                      value={employeeQuery}
                      onChange={(e) => setEmployeeQuery(e.target.value)}
                      placeholder="輸入工號或姓名搜尋…"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="max-h-60 overflow-auto border-t border-slate-100">
                    {filteredEmployees.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500">找不到符合的員工</p>
                    ) : (
                      filteredEmployees.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, employeeId: e.id }));
                            setEmployeeOpen(false);
                            setEmployeeQuery("");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="text-slate-800">
                            {e.employeeCode} {e.name}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">支援門市（調入）</span>
            <select
              value={form.toStoreId}
              onChange={(e) => setForm((f) => ({ ...f, toStoreId: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">請選擇</option>
              {activeStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">支援開始日期（C）</span>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm text-slate-600">支援結束日期（D）</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-600">支援起始時間（H-起）</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-600">支援結束時間（H-迄）</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="text-sm text-slate-600">事由</span>
            <select
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value as DispatchReason }))
              }
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {DISPATCH_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="text-sm text-slate-600">備註</span>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="例如：說明支援原因、特殊情況"
            />
          </label>
          <div className="text-sm text-slate-600">
            調度時數（自動）：{" "}
            <span className="font-semibold text-sky-700">
              {hoursPreview == null ? "—" : `${hoursPreview} 小時`}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
          >
            送出
          </button>
        </div>

        {message && <p className="mt-2 text-sm text-slate-700">{message}</p>}
      </div>

      <p className="mb-3 text-sm text-slate-500">
        預申請時數為填報時自動計算；實際可能延長或縮短，可點「編輯」填寫實際時數與確認狀態，績效計算將優先使用實際時數。「出勤時數」為該員工當日打卡上傳的總工時；「比對結果」為調度使用時數與出勤時數的比對（一致／延長／縮短／待比對）。
      </p>

      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-medium text-slate-800">查詢</h2>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">起日</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">迄日</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此區間沒有調度資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-700">日期</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">員工</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">調出</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">調入</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">預申請時數</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">實際時數</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">差異</th>
                  <th className="px-4 py-2 text-center font-medium text-slate-700">狀態</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">出勤時數</th>
                  <th className="px-4 py-2 text-center font-medium text-slate-700">比對結果</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">時間</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">備註</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">{r.workDate}</td>
                    <td className="px-4 py-2">
                      {r.employeeCode} {r.employeeName}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.fromStoreName ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{r.toStoreName ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{r.dispatchHours}</td>
                    <td className="px-4 py-2 text-right">
                      {r.actualHours != null ? r.actualHours : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.hoursDiff != null ? (
                        <span className={r.hoursDiff > 0 ? "text-green-600" : r.hoursDiff < 0 ? "text-amber-600" : "text-slate-600"}>
                          {r.hoursDiff > 0 ? "+" : ""}{r.hoursDiff}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={
                          r.confirmStatus === "已確認"
                            ? "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800"
                            : "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                        }
                      >
                        {r.confirmStatus === "已確認" ? "已確認" : "待確認"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-600">
                      {r.attendanceHours != null ? r.attendanceHours : "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={
                          r.comparisonResult === "待比對"
                            ? "rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600"
                            : r.comparisonResult === "一致"
                              ? "rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800"
                              : r.comparisonResult === "延長"
                                ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800"
                                : "rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800"
                        }
                      >
                        {r.comparisonResult}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {r.startTime && r.endTime ? `${r.startTime}~${r.endTime}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{r.remark ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="mr-2 text-sky-600 hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        className="text-red-600 hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editRow && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40"
          onClick={() => !editSaving && setEditRow(null)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-medium text-slate-800">填寫實際時數、狀態與事由/備註</h3>
            <p className="mb-3 text-sm text-slate-500">
              {editRow.workDate} {editRow.employeeCode} {editRow.employeeName} →{" "}
              {editRow.toStoreName ?? ""}（預申請 {editRow.dispatchHours} 小時）
            </p>
            <label className="mb-2 block">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">實際時數</span>
                <span className="text-sm text-slate-500">
                  出勤時數：{editRow.attendanceHours != null ? editRow.attendanceHours : "—"}
                </span>
              </div>
              <input
                type="number"
                min={0}
                step={0.5}
                value={editActualHours}
                onChange={(e) => setEditActualHours(e.target.value)}
                placeholder="留空則以預申請時數計算"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <p className="mt-1 text-xs text-slate-400">
                留空時以「預申請時數」計算（非出勤時數）；填寫後績效以實際時數計算。
              </p>
            </label>
            <label className="mb-4 block">
              <span className="text-sm text-slate-600">確認狀態</span>
              <select
                value={editConfirmStatus}
                onChange={(e) => setEditConfirmStatus(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="待確認">待確認</option>
                <option value="已確認">已確認</option>
              </select>
            </label>
            <label className="mb-4 block">
              <span className="text-sm text-slate-600">事由與備註</span>
              <input
                type="text"
                value={editRemark}
                onChange={(e) => setEditRemark(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                placeholder="會直接覆蓋下方表格中的備註內容"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !editSaving && setEditRow(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {editSaving ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

