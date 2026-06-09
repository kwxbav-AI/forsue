"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Store {
  id: string;
  name: string;
  department: string | null;
}

interface NewStoreSetting {
  id: string;
  storeId: string;
  openDate: string;
  guaranteeMonths: number;
  dailyGuarantee: number;
  store: Store;
}

export default function NewStoresPage() {
  const [settings, setSettings] = useState<NewStoreSetting[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    storeId: "",
    openDate: "",
    guaranteeMonths: 5,
    dailyGuarantee: 2640,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sRes, stRes] = await Promise.all([
        fetch("/api/settings/new-stores"),
        fetch("/api/stores?isActive=true"),
      ]);
      const sData = await sRes.json();
      const stData = await stRes.json();
      setSettings(Array.isArray(sData) ? sData : []);
      setStores(Array.isArray(stData.stores ?? stData) ? (stData.stores ?? stData) : []);
    } catch {
      setError("載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.storeId || !form.openDate) return;
    try {
      const res = await fetch("/api/settings/new-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          guaranteeMonths: Number(form.guaranteeMonths),
          dailyGuarantee: Number(form.dailyGuarantee),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "儲存失敗");
      }
      await fetchData();
      setShowForm(false);
      setForm({ storeId: "", openDate: "", guaranteeMonths: 5, dailyGuarantee: 2640 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string, storeName: string) => {
    if (!confirm(`確定刪除「${storeName}」的新店保障設定？`)) return;
    try {
      const res = await fetch(`/api/settings/new-stores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("刪除失敗");
      setSettings((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // 計算保障期間結束日
  const getEndDate = (openDate: string, months: number) => {
    const d = new Date(openDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  };

  const today = new Date().toISOString().slice(0, 10);
  const isActive = (setting: NewStoreSetting) =>
    getEndDate(setting.openDate, setting.guaranteeMonths) >= today;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-sm text-slate-500 hover:text-sky-600">
            設定區
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-800">新店保障設定</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          + 新增
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3"
        >
          <h2 className="font-medium text-slate-700">新增新店保障</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">門市</label>
              <select
                required
                value={form.storeId}
                onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">請選擇門市</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">開幕日</label>
              <input
                type="date"
                required
                value={form.openDate}
                onChange={(e) => setForm((f) => ({ ...f, openDate: e.target.value }))}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">保障月數</label>
              <input
                type="number"
                min={1}
                max={24}
                value={form.guaranteeMonths}
                onChange={(e) => setForm((f) => ({ ...f, guaranteeMonths: Number(e.target.value) }))}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">足月保障金額（元）</label>
              <input
                type="number"
                min={0}
                value={form.dailyGuarantee}
                onChange={(e) => setForm((f) => ({ ...f, dailyGuarantee: Number(e.target.value) }))}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              儲存
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">載入中…</div>
      ) : settings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-slate-400">
          尚未設定任何新店保障
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2 text-left">門市</th>
                <th className="px-4 py-2 text-left">開幕日</th>
                <th className="px-4 py-2 text-center">保障月數</th>
                <th className="px-4 py-2 text-left">保障期間</th>
                <th className="px-4 py-2 text-right">足月保障金額</th>
                <th className="px-4 py-2 text-center">狀態</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settings.map((s) => {
                const active = isActive(s);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium">{s.store.name}</td>
                    <td className="px-4 py-2 text-slate-600">{s.openDate.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-center">{s.guaranteeMonths} 個月</td>
                    <td className="px-4 py-2 text-slate-600">
                      {s.openDate.slice(0, 10)} ～ {getEndDate(s.openDate, s.guaranteeMonths)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      ${s.dailyGuarantee.toLocaleString("zh-TW")}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {active ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          保障中
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          已結束
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleDelete(s.id, s.store.name)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
