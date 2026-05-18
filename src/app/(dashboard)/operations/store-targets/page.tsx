"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type RetailStore = {
  id: string;
  storeName: string;
  region: string | null;
  isActive: boolean;
};

type StoreTarget = {
  id: string;
  storeId: string;
  storeName: string | null;
  region: string | null;
  year: number;
  month: number;
  salesTarget: number;
  laborHourTarget: number;
  rplhTarget: number | null;
  note: string | null;
};

const emptyForm = {
  storeId: "",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  salesTarget: "",
  laborHourTarget: "",
  note: "",
};

export default function StoreTargetsPage() {
  const [stores, setStores] = useState<RetailStore[]>([]);
  const [list, setList] = useState<StoreTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState(emptyForm.year);
  const [filterMonth, setFilterMonth] = useState(emptyForm.month);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/operations/stores?activeOnly=1");
    if (res.ok) setStores(await res.json());
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/operations/store-targets?year=${filterYear}&month=${filterMonth}`
    );
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [filterYear, filterMonth]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, year: filterYear, month: filterMonth });
    setMessage(null);
  }

  function startEdit(row: StoreTarget) {
    setEditingId(row.id);
    setForm({
      storeId: row.storeId,
      year: row.year,
      month: row.month,
      salesTarget: String(row.salesTarget),
      laborHourTarget: String(row.laborHourTarget),
      note: row.note ?? "",
    });
    setMessage(null);
  }

  const previewRplh =
    form.salesTarget && form.laborHourTarget
      ? (Number(form.salesTarget) / Number(form.laborHourTarget)).toFixed(2)
      : null;

  async function submit() {
    setMessage(null);
    if (!form.storeId) {
      setMessage("\u8acb\u9078\u64c7\u9580\u5e02");
      return;
    }
    const salesTarget = Number(form.salesTarget);
    const laborHourTarget = Number(form.laborHourTarget);
    if (!salesTarget || salesTarget <= 0 || !laborHourTarget || laborHourTarget <= 0) {
      setMessage("\u8acb\u8f38\u5165\u6709\u6548\u7684\u696d\u7e3e\u8207\u5de5\u6642\u76ee\u6a19");
      return;
    }

    const payload = {
      storeId: form.storeId,
      year: form.year,
      month: form.month,
      salesTarget,
      laborHourTarget,
      note: form.note || null,
    };

    const res = editingId
      ? await fetch(`/api/operations/store-targets/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/operations/store-targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "\u5132\u5b58\u5931\u6557");
      return;
    }
    resetForm();
    refresh();
  }

  async function remove(id: string) {
    if (!confirm("\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u76ee\u6a19\u8a2d\u5b9a\uff1f")) return;
    const res = await fetch(`/api/operations/store-targets/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "\u522a\u9664\u5931\u6557");
      return;
    }
    if (editingId === id) resetForm();
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{"\u9580\u5e02\u76ee\u6a19\u8a2d\u5b9a"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            RPLH = {"\u6708\u696d\u7e3e\u76ee\u6a19"} / {"\u6708\u5de5\u6642\u76ee\u6a19"}（{"\u5132\u5b58\u6642\u81ea\u52d5\u8a08\u7b97"}）
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/operations/dashboard"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {"\u71df\u904b\u7e3d\u89bd"}
          </Link>
          <Link
            href="/"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {"\u56de\u9996\u9801"}
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-medium text-slate-800">
          {editingId ? "\u7de8\u8f2f\u76ee\u6a19" : "\u65b0\u589e\u76ee\u6a19"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm">
            <span className="text-slate-600">{"\u9580\u5e02"}</span>
            <select
              value={form.storeId}
              onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">{"\u8acb\u9078\u64c7"}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                  {s.region ? `（${s.region}）` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u5e74"}</span>
            <input
              type="number"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u6708"}</span>
            <input
              type="number"
              min={1}
              max={12}
              value={form.month}
              onChange={(e) => setForm((f) => ({ ...f, month: Number(e.target.value) }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u6708\u696d\u7e3e\u76ee\u6a19"}</span>
            <input
              type="number"
              value={form.salesTarget}
              onChange={(e) => setForm((f) => ({ ...f, salesTarget: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u6708\u5de5\u6642\u76ee\u6a19"}</span>
            <input
              type="number"
              value={form.laborHourTarget}
              onChange={(e) => setForm((f) => ({ ...f, laborHourTarget: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">RPLH（{"\u9810\u89bd"}）</span>
            <input
              readOnly
              value={previewRplh ?? ""}
              className="mt-1 w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-slate-600">{"\u5099\u8a3b"}</span>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {editingId ? "\u5132\u5b58\u8b8a\u66f4" : "\u65b0\u589e"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {"\u53d6\u6d88"}
            </button>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-slate-600">{"\u7be9\u9078\u5e74"}</span>
          <input
            type="number"
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="mt-1 block rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">{"\u7be9\u9078\u6708"}</span>
          <input
            type="number"
            min={1}
            max={12}
            value={filterMonth}
            onChange={(e) => setFilterMonth(Number(e.target.value))}
            className="mt-1 block rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">{"\u8f09\u5165\u4e2d..."}</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{"\u6c92\u6709\u7b26\u5408\u689d\u4ef6\u7684\u76ee\u6a19"}</p>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2">{"\u9580\u5e02"}</th>
                <th className="px-3 py-2">{"\u5340\u57df"}</th>
                <th className="px-3 py-2">{"\u5e74\u6708"}</th>
                <th className="px-3 py-2 text-right">{"\u696d\u7e3e"}</th>
                <th className="px-3 py-2 text-right">{"\u5de5\u6642"}</th>
                <th className="px-3 py-2 text-right">RPLH</th>
                <th className="px-3 py-2">{"\u5099\u8a3b"}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{row.storeName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.region ?? "-"}</td>
                  <td className="px-3 py-2">
                    {row.year}/{row.month}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.salesTarget.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{row.laborHourTarget}</td>
                  <td className="px-3 py-2 text-right">
                    {row.rplhTarget != null ? row.rplhTarget.toFixed(2) : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.note ?? ""}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="mr-2 text-sky-600 hover:underline"
                    >
                      {"\u7de8\u8f2f"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="text-red-600 hover:underline"
                    >
                      {"\u522a\u9664"}
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
