"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Store = {
  id: string;
  name: string;
  department?: string | null;
  isActive?: boolean;
};

const STATUS_LABELS = {
  saving: "儲存中…",
  saved: "已儲存",
  error: "儲存失敗",
} as const;

export default function AttendanceLocationSettingsPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [status, setStatus] = useState<keyof typeof STATUS_LABELS | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setStores(Array.isArray(d) ? d : []))
      .catch(() => setStores([]));
  }, []);

  useEffect(() => {
    fetch("/api/settings/attendance-location", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.excludedDepartments) ? d.excludedDepartments : [];
        setExcluded(list.map((x: unknown) => String(x)).map((s: string) => s.trim()).filter(Boolean));
      })
      .catch(() => {});
  }, []);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      const dept = (s.department || "").trim();
      if (dept) set.add(dept);
    }
    return Array.from(set).sort();
  }, [stores]);

  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  function toggleDept(dept: string) {
    setExcluded((prev) => {
      const set = new Set(prev);
      if (set.has(dept)) set.delete(dept);
      else set.add(dept);
      return Array.from(set).sort();
    });
  }

  function addCustom() {
    const v = custom.trim();
    if (!v) return;
    setExcluded((prev) => Array.from(new Set([...prev, v])).sort());
    setCustom("");
  }

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/settings/attendance-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludedDepartments: excluded }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error || "儲存失敗");
        return;
      }
      setExcluded(Array.isArray(data?.excludedDepartments) ? data.excludedDepartments : excluded);
      setStatus("saved");
      setMessage("已儲存。注意：需重新上傳出勤表才會套用到新資料。");
      setTimeout(() => setStatus(null), 1500);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "儲存失敗");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">出勤打卡地點比對設定</h1>
        <Link
          href="/settings"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回設定區
        </Link>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          勾選的部門將被視為「排除比對」：平常不做打卡地點比對；但若同日存在調度資料，仍會進行調度解釋判定。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          提醒：此設定會在「出勤上傳」時寫入比對結果，修改設定後要重新上傳出勤表才會生效在新匯入資料。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-slate-800">排除比對部門</h2>
          <button
            type="button"
            onClick={save}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            儲存
          </button>
        </div>

        {(status || message) && (
          <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>{status ? STATUS_LABELS[status] : "訊息"}</span>
            </div>
            {message ? <p className="mt-1 text-slate-600">{message}</p> : null}
          </div>
        )}

        <div className="mb-4">
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="新增自訂部門（例如：後勤部門）"
              className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addCustom}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              新增
            </button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {departmentOptions.length === 0 ? (
            <p className="text-sm text-slate-500">目前沒有可用部門選項（請先設定門市 department）。</p>
          ) : (
            departmentOptions.map((dept) => (
              <label key={dept} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2">
                <input
                  type="checkbox"
                  checked={excludedSet.has(dept)}
                  onChange={() => toggleDept(dept)}
                />
                <span className="text-sm text-slate-800">{dept}</span>
              </label>
            ))
          )}
        </div>

        {excluded.length > 0 ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-medium">目前排除（{excluded.length}）</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {excluded.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDept(d)}
                  className="rounded bg-white px-2 py-1 text-xs text-amber-900 hover:bg-amber-100"
                  title="點擊移除"
                >
                  {d} ✕
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

