"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface BonusMultiplier {
  id: string;
  position: string;
  multiplier: number;
}

export default function BonusMultipliersPage() {
  const [rows, setRows] = useState<BonusMultiplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newPosition, setNewPosition] = useState("");
  const [newMultiplier, setNewMultiplier] = useState("1");

  useEffect(() => {
    fetch("/api/settings/bonus-multipliers")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data.map((r: BonusMultiplier) => ({ ...r, multiplier: Number(r.multiplier) })) : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (id: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, multiplier: parseFloat(value) || 0 } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const body = rows.map((r) => ({ position: r.position, multiplier: r.multiplier }));
      const res = await fetch("/api/settings/bonus-multipliers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "儲存失敗");
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRow = () => {
    if (!newPosition.trim()) return;
    setRows((prev) => [
      ...prev,
      { id: `new_${Date.now()}`, position: newPosition.trim(), multiplier: parseFloat(newMultiplier) || 1 },
    ]);
    setNewPosition("");
    setNewMultiplier("1");
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-sm text-slate-500 hover:text-sky-600">
          設定區
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-800">獎金倍率設定</h1>
      </div>
      <p className="text-sm text-slate-500">依職稱設定績效獎金倍率。倍率為 0 表示該職稱不計算獎金。</p>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">儲存成功</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">載入中…</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-2 text-left">職稱</th>
                  <th className="px-4 py-2 text-center">獎金倍率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">{r.position}</td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={r.multiplier}
                        onChange={(e) => handleChange(r.id, e.target.value)}
                        className={`w-20 rounded border px-2 py-1 text-center text-sm ${r.multiplier === 0 ? "border-slate-200 text-slate-400" : "border-slate-300"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 新增職稱 */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="職稱名稱"
              value={newPosition}
              onChange={(e) => setNewPosition(e.target.value)}
              className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              type="number"
              step="0.1"
              min="0"
              max="5"
              placeholder="倍率"
              value={newMultiplier}
              onChange={(e) => setNewMultiplier(e.target.value)}
              className="w-20 rounded border border-slate-300 px-2 py-1.5 text-center text-sm"
            />
            <button
              onClick={handleAddRow}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              新增
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-sky-600 px-6 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "儲存中…" : "儲存設定"}
          </button>
        </>
      )}
    </div>
  );
}
