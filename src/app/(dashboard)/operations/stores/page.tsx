"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatRetailBusinessHoursDisplay } from "@/lib/retail-store-hours";

type RetailStore = {
  id: string;
  storeName: string;
  region: string | null;
  managerName: string | null;
  dailyBusinessHours: number | null;
  weekdayBusinessHours: number | null;
  saturdayBusinessHours: number | null;
  defaultLaborHoursPerDay: number | null;
  isActive: boolean;
};

const emptyForm = {
  storeName: "",
  region: "",
  managerName: "",
  weekdayBusinessHours: "",
  saturdayBusinessHours: "",
  defaultLaborHoursPerDay: "",
  isActive: true,
};

function parseOptionalHours(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function OperationsStoresPage() {
  const [list, setList] = useState<RetailStore[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operations/stores");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage(null);
  }

  function startEdit(row: RetailStore) {
    setEditingId(row.id);
    const weekday =
      row.weekdayBusinessHours ?? row.dailyBusinessHours;
    setForm({
      storeName: row.storeName,
      region: row.region ?? "",
      managerName: row.managerName ?? "",
      weekdayBusinessHours: weekday != null ? String(weekday) : "",
      saturdayBusinessHours:
        row.saturdayBusinessHours != null ? String(row.saturdayBusinessHours) : "",
      defaultLaborHoursPerDay:
        row.defaultLaborHoursPerDay != null ? String(row.defaultLaborHoursPerDay) : "",
      isActive: row.isActive,
    });
    setMessage(null);
  }

  async function submit() {
    setMessage(null);
    if (!form.storeName.trim()) {
      setMessage("請輸入門市名稱");
      return;
    }
    const weekdayBusinessHours = parseOptionalHours(form.weekdayBusinessHours);
    const saturdayBusinessHours = parseOptionalHours(form.saturdayBusinessHours);
    const defaultLaborHoursPerDay = parseOptionalHours(form.defaultLaborHoursPerDay);
    if (form.weekdayBusinessHours.trim() && weekdayBusinessHours == null) {
      setMessage("平日營業時長請輸入有效數字");
      return;
    }
    if (form.saturdayBusinessHours.trim() && saturdayBusinessHours == null) {
      setMessage("週六營業時長請輸入有效數字");
      return;
    }
    if (form.defaultLaborHoursPerDay.trim() && defaultLaborHoursPerDay == null) {
      setMessage("預設工時請輸入有效數字");
      return;
    }

    const payload = {
      storeName: form.storeName.trim(),
      region: form.region.trim() || null,
      managerName: form.managerName.trim() || null,
      weekdayBusinessHours,
      saturdayBusinessHours,
      defaultLaborHoursPerDay,
      isActive: form.isActive,
    };

    const res = editingId
      ? await fetch(`/api/operations/stores/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/operations/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "儲存失敗");
      return;
    }
    resetForm();
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`確定要刪除門市「${name}」？相關目標與績效也會一併刪除。`)) return;
    const res = await fetch(`/api/operations/stores/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "刪除失敗");
      return;
    }
    if (editingId === id) resetForm();
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">營運門市管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            營運分析模組用門市主檔。可設定週一～五與週六營業時長；預設工時僅作備援（加班分析以門市目標月工時為準）。
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/operations/dashboard"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            營運總覽
          </Link>
          <Link
            href="/"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            回首頁
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-800">
          {editingId ? "編輯門市" : "新增門市"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-600">門市名稱</span>
            <input
              value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">區域</span>
            <input
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder="例如：桃園區、宜蘭區"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">區督 / 負責主管</span>
            <input
              value={form.managerName}
              onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">平日營業時長（週一～五，小時）</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.weekdayBusinessHours}
              onChange={(e) =>
                setForm((f) => ({ ...f, weekdayBusinessHours: e.target.value }))
              }
              placeholder="例： 12"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">週六營業時長（小時）</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.saturdayBusinessHours}
              onChange={(e) =>
                setForm((f) => ({ ...f, saturdayBusinessHours: e.target.value }))
              }
              placeholder="例： 14（若與平日相同可留空）"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">每日預設工時（小時，選填備援）</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.defaultLaborHoursPerDay}
              onChange={(e) =>
                setForm((f) => ({ ...f, defaultLaborHoursPerDay: e.target.value }))
              }
              placeholder="例： 24"
              className="mt-1 w-full max-w-xs rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span className="text-slate-600">啟用</span>
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={submit}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {editingId ? "儲存" : "新增"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="ml-2 rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ?
          <p className="p-4 text-sm text-slate-500">載入中...</p>
        : list.length === 0 ?
          <p className="p-4 text-sm text-slate-500">尚無門市</p>
        : <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2">門市</th>
                <th className="px-3 py-2">區域</th>
                <th className="px-3 py-2">負責主管</th>
                <th className="px-3 py-2">營業時長</th>
                <th className="px-3 py-2 text-right">預設工時</th>
                <th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{row.storeName}</td>
                  <td className="px-3 py-2">{row.region ?? "-"}</td>
                  <td className="px-3 py-2">{row.managerName ?? "-"}</td>
                  <td className="px-3 py-2">
                    {formatRetailBusinessHoursDisplay(row)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.defaultLaborHoursPerDay != null ?
                      row.defaultLaborHoursPerDay
                    : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {row.isActive ?
                      <span className="text-green-600">啟用</span>
                    : <span className="text-slate-400">停用</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="mr-2 text-sky-600 hover:underline"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.id, row.storeName)}
                      className="text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}
