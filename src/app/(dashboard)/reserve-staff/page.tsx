"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Store = { id: string; name: string; code: string | null; department: string | null } | null;

type EmployeeRow = {
  id: string;
  employeeCode: string;
  name: string;
  position: string | null;
  defaultStore: Store;
  isReserveStaff: boolean;
  reserveWorkPercent: number | null;
};

export default function ReserveStaffPage() {
  const [list, setList] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { isReserveStaff: boolean; reserveWorkPercent: string }>>({});

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/employees");
    const data = await res.json().catch(() => []);
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    // 初始化 draft
    const next: Record<string, { isReserveStaff: boolean; reserveWorkPercent: string }> = {};
    for (const e of list) {
      next[e.id] = {
        isReserveStaff: !!e.isReserveStaff,
        reserveWorkPercent: e.reserveWorkPercent == null ? "" : String(e.reserveWorkPercent),
      };
    }
    setDraft(next);
  }, [list]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return list;
    return list.filter((e) => {
      const storeText = e.defaultStore ? `${e.defaultStore.name} ${e.defaultStore.code ?? ""} ${e.defaultStore.department ?? ""}` : "";
      return (
        e.employeeCode.toLowerCase().includes(query) ||
        e.name.toLowerCase().includes(query) ||
        (e.position ?? "").toLowerCase().includes(query) ||
        storeText.toLowerCase().includes(query)
      );
    });
  }, [list, q]);

  async function save(id: string) {
    setMessage(null);
    const d = draft[id];
    if (!d) return;

    if (d.isReserveStaff) {
      const v = Number(d.reserveWorkPercent);
      if (!d.reserveWorkPercent.trim()) {
        setMessage("儲備人力必須填寫工時計算%");
        return;
      }
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        setMessage("工時計算% 必須介於 0~100");
        return;
      }
    }

    setSavingId(id);
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isReserveStaff: d.isReserveStaff,
        reserveWorkPercent: d.isReserveStaff ? Number(d.reserveWorkPercent) : null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingId(null);
    if (!res.ok) {
      setMessage(data.error || "更新失敗");
      return;
    }
    setMessage("已更新儲備人力設定");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">儲備人力設定</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/uploads"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            回資料上傳中心
          </Link>
          <Link
            href="/"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            回首頁
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          勾選「儲備人力」後，需填寫「工時計算%」。此比例會在「全店到齊且加班總時數未超過 3 小時」時套用。
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-sm text-slate-600">搜尋</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="工號 / 姓名 / 職稱 / 門市 / 部門…"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        {message && <p className="mt-2 text-sm text-slate-700">{message}</p>}
      </div>

      <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">沒有符合的員工</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-20 w-[120px] min-w-[120px] whitespace-nowrap bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">
                  工號
                </th>
                <th className="sticky left-[120px] z-20 w-[140px] min-w-[140px] whitespace-nowrap bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">
                  姓名
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">職稱</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">門市</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">儲備人力</th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">工時計算%</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const d = draft[e.id] ?? {
                  isReserveStaff: e.isReserveStaff,
                  reserveWorkPercent: e.reserveWorkPercent == null ? "" : String(e.reserveWorkPercent),
                };
                return (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[120px] min-w-[120px] whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-800">
                      {e.employeeCode}
                    </td>
                    <td className="sticky left-[120px] z-[5] w-[140px] min-w-[140px] whitespace-nowrap bg-white px-3 py-2 text-slate-800">
                      {e.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.position || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {e.defaultStore ? e.defaultStore.name : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.isReserveStaff}
                          onChange={(ev) =>
                            setDraft((prev) => ({
                              ...prev,
                              [e.id]: {
                                isReserveStaff: ev.target.checked,
                                reserveWorkPercent: ev.target.checked ? (prev[e.id]?.reserveWorkPercent ?? "") : "",
                              },
                            }))
                          }
                        />
                        <span className="text-slate-700">{d.isReserveStaff ? "是" : "否"}</span>
                      </label>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <input
                        value={d.reserveWorkPercent}
                        onChange={(ev) =>
                          setDraft((prev) => ({
                            ...prev,
                            [e.id]: { ...d, reserveWorkPercent: ev.target.value },
                          }))
                        }
                        disabled={!d.isReserveStaff}
                        placeholder={d.isReserveStaff ? "例如 50" : "—"}
                        className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => save(e.id)}
                        disabled={savingId === e.id}
                        className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-60"
                      >
                        {savingId === e.id ? "儲存中…" : "儲存"}
                      </button>
                    </td>
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

