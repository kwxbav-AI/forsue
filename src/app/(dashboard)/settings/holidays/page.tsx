"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Holiday = {
  id: string;
  date: string;
  name: string;
  isActive: boolean;
};

export default function HolidaysPage() {
  const [list, setList] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/settings/holidays");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addHoliday() {
    setMessage(null);
    if (!date) {
      setMessage("請選擇日期");
      return;
    }
    const res = await fetch("/api/settings/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, name: name || "假日" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "儲存失敗");
      return;
    }
    setName("");
    refresh();
  }

  async function removeHoliday(id: string) {
    if (!confirm("確定要將這一天從假日清單移除？")) return;
    const res = await fetch(`/api/settings/holidays/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "刪除失敗");
      return;
    }
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">假日設定（不計入達標總天數）</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-800">新增假日</h2>
        <p className="mb-3 text-sm text-slate-500">
          這裡設定的日期（例如中秋節、颱風假、教育訓練…）在「達標次數統計」中不會列入「總天數」與「未達標天數」。
          星期日則自動排除，不需額外設定。
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">日期</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="text-slate-600">說明（選填）</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：中秋節、教育訓練…"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={addHoliday}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            新增
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-700">{message}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">目前沒有額外假日設定。（系統仍會自動排除所有星期日）</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-2 font-medium text-slate-700">日期</th>
                <th className="px-4 py-2 font-medium text-slate-700">說明</th>
                <th className="px-4 py-2 font-medium text-slate-700">狀態</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((h) => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="px-4 py-2">{h.date}</td>
                  <td className="px-4 py-2 text-slate-700">{h.name}</td>
                  <td className="px-4 py-2">
                    {h.isActive ? (
                      <span className="text-green-600">生效中</span>
                    ) : (
                      <span className="text-slate-400">已停用</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {h.isActive && (
                      <button
                        type="button"
                        onClick={() => removeHoliday(h.id)}
                        className="text-red-600 hover:underline"
                      >
                        停用
                      </button>
                    )}
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

