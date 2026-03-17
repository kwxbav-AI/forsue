"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Store = {
  id: string;
  name: string;
  code: string | null;
  department?: string | null;
  isActive?: boolean;
  aliases: string[];
};

export default function StoresPage() {
  const [list, setList] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [department, setDepartment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [edit, setEdit] = useState<Store | null>(null);
  const [editName, setEditName] = useState("");
  const [editAliasesText, setEditAliasesText] = useState("");
  const [editDepartment, setEditDepartment] = useState("");

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/stores");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const aliasPreview = useMemo(
    () =>
      aliasesText
        .split(/[\s,，]+/g)
        .map((s) => s.trim())
        .filter(Boolean),
    [aliasesText]
  );

  async function createStore() {
    setMessage(null);
    const aliases = aliasPreview;
    if (!name.trim()) {
      setMessage("請輸入門市名稱");
      return;
    }
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, department: department || null, aliases }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "新增失敗");
      return;
    }
    setName("");
    setAliasesText("");
    setDepartment("");
    setMessage("新增成功");
    refresh();
  }

  async function importDefault() {
    setMessage(null);
    const res = await fetch("/api/stores/import-default", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "匯入失敗");
      return;
    }
    setMessage(`已匯入預設清單：${data.count ?? 0} 筆`);
    refresh();
  }

  function openEdit(s: Store) {
    setEdit(s);
    setEditName(s.name);
    setEditDepartment(s.department ?? "");
    setEditAliasesText(([s.code, ...(s.aliases || [])].filter(Boolean) as string[]).join(" "));
  }

  const editAliasPreview = useMemo(
    () =>
      editAliasesText
        .split(/[\s,，]+/g)
        .map((s) => s.trim())
        .filter(Boolean),
    [editAliasesText]
  );

  async function saveEdit() {
    if (!edit) return;
    const res = await fetch(`/api/stores/${edit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, department: editDepartment || null, aliases: editAliasPreview }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "更新失敗");
      return;
    }
    setEdit(null);
    setMessage("更新成功");
    refresh();
  }

  async function deleteStore(id: string, storeName: string) {
    if (!confirm(`確定要停用門市「${storeName}」？（停用後不再出現在報表與下拉選單）`)) return;
    const res = await fetch(`/api/stores/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "刪除失敗");
      return;
    }
    setMessage("已停用門市");
    refresh();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">門市管理</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-slate-800">新增門市</h2>
        <p className="mb-3 text-sm text-slate-500">
          這裡的「代碼」用來對應上傳的營收檔（例如 POSA/POSB/POSC：A024、B024、C024）。
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="block text-sm text-slate-600">門市名稱</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="例如：大有"
            />
          </label>
          <label className="flex-[2]">
            <span className="block text-sm text-slate-600">部門（用來對應出勤表）</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="例如：宜蘭區-中正店"
            />
          </label>
          <label className="flex-[2]">
            <span className="block text-sm text-slate-600">代碼（可多個，用逗號/空白分隔）</span>
            <input
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="例如：A024 B024 C024"
            />
          </label>
          <button
            type="button"
            onClick={createStore}
            className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
          >
            新增
          </button>
          <button
            type="button"
            onClick={importDefault}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            匯入預設清單
          </button>
        </div>
        {aliasPreview.length > 0 && (
          <p className="mt-2 text-sm text-slate-500">
            代碼預覽：{aliasPreview.join("、")}
          </p>
        )}
        {message && <p className="mt-2 text-sm text-slate-700">{message}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">尚無門市資料</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-700">門市</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">POS 代碼（A/B/C...）</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">部門</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 font-medium">
                      {s.name}
                      {s.isActive === false && (
                        <span className="ml-2 rounded bg-slate-100 px-1 text-xs text-slate-500">
                          已停用
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {[s.code, ...(s.aliases || [])].filter(Boolean).join("、") || "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{s.department || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="mr-3 text-sky-600 hover:underline"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStore(s.id, s.name)}
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

      {edit && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <h2 className="mb-4 font-medium text-slate-800">編輯門市</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-600">門市名稱</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">部門（用來對應出勤表）</span>
                <input
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="例如：宜蘭區-中正店"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">POS 代碼（A/B/C...，用逗號/空白分隔）</span>
                <input
                  value={editAliasesText}
                  onChange={(e) => setEditAliasesText(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  placeholder="例如：A024 B024 C024"
                />
                {editAliasPreview.length > 0 && (
                  <p className="mt-2 text-sm text-slate-500">
                    代碼預覽：{editAliasPreview.join("、")}
                  </p>
                )}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

