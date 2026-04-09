"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PendingDeletionPanel } from "@/components/pending-deletion-panel";

type Store = {
  id: string;
  name: string;
  code: string | null;
  department?: string | null;
  isActive?: boolean;
  aliases: string[];
};

type StoreChangeLog = {
  id: string;
  storeId: string;
  action: string;
  changedBy: string | null;
  before: any;
  after: any;
  changedAt: string;
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
  const [canViewStoreChangeLogs, setCanViewStoreChangeLogs] = useState(false);
  const [permPending, setPermPending] = useState({ canReadPending: false, canApprove: false });
  const [pendingRefresh, setPendingRefresh] = useState(0);

  const [logStore, setLogStore] = useState<Store | null>(null);
  const [logs, setLogs] = useState<StoreChangeLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/stores");
    if (res.ok) setList(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    (async () => {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      setCanViewStoreChangeLogs(Boolean(data?.user?.canViewStoreChangeLogs));
      setPermPending({
        canReadPending: Boolean(data?.user?.canReadPendingStores),
        canApprove: Boolean(data?.user?.canApproveDeleteStores),
      });
    })();
  }, []);

  useEffect(() => {
    const onPending = () => {
      void refresh();
      setPendingRefresh((k) => k + 1);
    };
    window.addEventListener("pending-deletions-changed", onPending);
    return () => window.removeEventListener("pending-deletions-changed", onPending);
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
    if (res.ok) {
      setMessage("已停用門市");
      void refresh();
      setPendingRefresh((k) => k + 1);
      return;
    }
    if (res.status === 202) {
      setMessage(data.message || "已送出停用申請");
      void refresh();
      setPendingRefresh((k) => k + 1);
      return;
    }
    setMessage(data.error || "停用失敗");
  }

  async function openLogs(s: Store) {
    setLogStore(s);
    setLogs([]);
    setLogsError(null);
    setLogsLoading(true);
    const res = await fetch(`/api/stores/${s.id}/change-logs`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLogsError(data.error || "讀取異動紀錄失敗");
      setLogsLoading(false);
      return;
    }
    setLogs(Array.isArray(data.logs) ? data.logs : []);
    setLogsLoading(false);
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

      <PendingDeletionPanel
        segment="stores"
        canRead={permPending.canReadPending}
        canApprove={permPending.canApprove}
        title="待審門市停用申請"
        refreshKey={pendingRefresh}
      />

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
          <div className="relative max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-[180px] min-w-[180px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    門市
                  </th>
                  <th className="sticky left-[180px] z-20 w-[220px] min-w-[220px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    POS 代碼（A/B/C...）
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">部門</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[180px] min-w-[180px] bg-white px-4 py-2 font-medium">
                      {s.name}
                      {s.isActive === false && (
                        <span className="ml-2 rounded bg-slate-100 px-1 text-xs text-slate-500">
                          已停用
                        </span>
                      )}
                    </td>
                    <td className="sticky left-[180px] z-[5] w-[220px] min-w-[220px] bg-white px-4 py-2 text-slate-600">
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
                      {canViewStoreChangeLogs ? (
                        <button
                          type="button"
                          onClick={() => void openLogs(s)}
                          className="mr-3 text-slate-600 hover:underline"
                        >
                          異動
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => deleteStore(s.id, s.name)}
                        className="text-red-600 hover:underline"
                      >
                        停用
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logStore && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-slate-800">門市異動紀錄</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {logStore.name}（{[logStore.code, ...(logStore.aliases || [])].filter(Boolean).join("、") || "—"}）
                </p>
              </div>
              <button
                type="button"
                onClick={() => !logsLoading && setLogStore(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                disabled={logsLoading}
              >
                關閉
              </button>
            </div>

            <div className="mt-4">
              {logsLoading ? (
                <p className="text-sm text-slate-500">載入中…</p>
              ) : logsError ? (
                <p className="text-sm text-red-700">{logsError}</p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-slate-500">尚無異動紀錄</p>
              ) : (
                <div className="max-h-[60vh] overflow-auto rounded border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left">
                      <tr>
                        <th className="w-[160px] px-3 py-2 font-medium text-slate-700">時間</th>
                        <th className="w-[120px] px-3 py-2 font-medium text-slate-700">操作者</th>
                        <th className="w-[120px] px-3 py-2 font-medium text-slate-700">動作</th>
                        <th className="px-3 py-2 font-medium text-slate-700">變更內容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => {
                        const beforeCodes = [l.before?.code, ...(l.before?.aliases || [])].filter(Boolean).join("、") || "—";
                        const afterCodes = [l.after?.code, ...(l.after?.aliases || [])].filter(Boolean).join("、") || "—";
                        const beforeActive = l.before?.isActive === false ? "停用" : "啟用";
                        const afterActive = l.after?.isActive === false ? "停用" : "啟用";
                        return (
                          <tr key={l.id} className="border-b border-slate-100 align-top">
                            <td className="px-3 py-2 text-slate-600">
                              {new Date(l.changedAt).toLocaleString("zh-TW")}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{l.changedBy || "—"}</td>
                            <td className="px-3 py-2 text-slate-600">{l.action}</td>
                            <td className="px-3 py-2">
                              <div className="space-y-1">
                                <div>
                                  <span className="text-slate-500">POS：</span>
                                  <span className="text-slate-700">{beforeCodes}</span>
                                  <span className="mx-2 text-slate-400">→</span>
                                  <span className="font-medium text-slate-900">{afterCodes}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">門市：</span>
                                  <span className="text-slate-700">{l.before?.name ?? "—"}</span>
                                  <span className="mx-2 text-slate-400">→</span>
                                  <span className="text-slate-900">{l.after?.name ?? "—"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">部門：</span>
                                  <span className="text-slate-700">{l.before?.department ?? "—"}</span>
                                  <span className="mx-2 text-slate-400">→</span>
                                  <span className="text-slate-900">{l.after?.department ?? "—"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">狀態：</span>
                                  <span className="text-slate-700">{beforeActive}</span>
                                  <span className="mx-2 text-slate-400">→</span>
                                  <span className="text-slate-900">{afterActive}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

