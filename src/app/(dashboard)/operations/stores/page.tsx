"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type RetailStore = {
  id: string;
  storeName: string;
  region: string | null;
  managerName: string | null;
  isActive: boolean;
};

const emptyForm = {
  storeName: "",
  region: "",
  managerName: "",
  isActive: true,
};

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
    setForm({
      storeName: row.storeName,
      region: row.region ?? "",
      managerName: row.managerName ?? "",
      isActive: row.isActive,
    });
    setMessage(null);
  }

  async function submit() {
    setMessage(null);
    if (!form.storeName.trim()) {
      setMessage("\u8acb\u8f38\u5165\u9580\u5e02\u540d\u7a31");
      return;
    }
    const payload = {
      storeName: form.storeName.trim(),
      region: form.region.trim() || null,
      managerName: form.managerName.trim() || null,
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
      setMessage(data.error || "\u5132\u5b58\u5931\u6557");
      return;
    }
    resetForm();
    refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`\u78ba\u5b9a\u8981\u522a\u9664\u9580\u5e02\u300c${name}\u300d\uff1f\u76f8\u95dc\u76ee\u6a19\u8207\u7e3e\u6548\u4e5f\u6703\u4e00\u4f75\u522a\u9664\u3002`)) return;
    const res = await fetch(`/api/operations/stores/${id}`, { method: "DELETE" });
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
          <h1 className="text-xl font-bold text-slate-800">{"\u71df\u904b\u9580\u5e02\u7ba1\u7406"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {"\u71df\u904b\u5206\u6790\u6a21\u7d44\u7528\u9580\u5e02\u4e3b\u6a94\uff08\u8207\u65e5\u5e38\u7e3e\u6548\u7cfb\u7d71\u9580\u5e02\u5206\u958b\uff09"}
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
          {editingId ? "\u7de8\u8f2f\u9580\u5e02" : "\u65b0\u589e\u9580\u5e02"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-600">{"\u9580\u5e02\u540d\u7a31"}</span>
            <input
              value={form.storeName}
              onChange={(e) => setForm((f) => ({ ...f, storeName: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u5340\u57df"}</span>
            <input
              value={form.region}
              onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              placeholder={"\u4f8b\u5982\uff1a\u6843\u5712\u5340\u3001\u5b9c\u862d\u5340"}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">{"\u5340\u7763 / \u8ca0\u8cac\u4e3b\u7ba1"}</span>
            <input
              value={form.managerName}
              onChange={(e) => setForm((f) => ({ ...f, managerName: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span className="text-slate-600">{"\u555f\u7528"}</span>
          </label>
        </div>
        <div>
          <button
            type="button"
            onClick={submit}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            {editingId ? "\u5132\u5b58" : "\u65b0\u589e"}
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

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">{"\u8f09\u5165\u4e2d..."}</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">{"\u5c1a\u7121\u9580\u5e02"}</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2">{"\u9580\u5e02"}</th>
                <th className="px-3 py-2">{"\u5340\u57df"}</th>
                <th className="px-3 py-2">{"\u8ca0\u8cac\u4e3b\u7ba1"}</th>
                <th className="px-3 py-2">{"\u72c0\u614b"}</th>
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
                    {row.isActive ? (
                      <span className="text-green-600">{"\u555f\u7528"}</span>
                    ) : (
                      <span className="text-slate-400">{"\u505c\u7528"}</span>
                    )}
                  </td>
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
                      onClick={() => remove(row.id, row.storeName)}
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
