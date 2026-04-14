"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ModuleRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  groupKey: string;
  sortOrder: number;
  parentId: string | null;
  canRead: boolean;
  canWrite: boolean;
};

type RoleRow = { id: string; key: string; name: string; isActive: boolean };

function statusToValue(canRead: boolean, canWrite: boolean): "none" | "read" | "write" {
  if (canWrite) return "write";
  if (canRead) return "read";
  return "none";
}

export default function RolePermissionsAdmin() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  async function loadRoles() {
    const res = await fetch("/api/roles", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "讀取角色失敗");
      setRoles([]);
      return;
    }
    const list = Array.isArray(data.roles) ? (data.roles as RoleRow[]) : [];
    setRoles(list);
    if (!selectedRoleId && list.length > 0) {
      // 預設選 STORE_STAFF，否則選第一個
      const storeStaff = list.find((r) => r.key === "STORE_STAFF") ?? list[0];
      setSelectedRoleId(storeStaff?.id ?? "");
    }
  }

  async function load() {
    if (!selectedRoleId) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/role-permissions?roleId=${encodeURIComponent(selectedRoleId)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "讀取失敗");
        setModules([]);
        return;
      }
      setModules(Array.isArray(data.modules) ? data.modules : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId]);

  function updateModuleStatus(moduleId: string, value: "none" | "read" | "write") {
    setModules((prev) =>
      prev.map((m) => {
        if (m.id !== moduleId) return m;
        if (value === "none") return { ...m, canRead: false, canWrite: false };
        if (value === "read") return { ...m, canRead: true, canWrite: false };
        return { ...m, canRead: true, canWrite: true };
      })
    );
  }

  async function save() {
    if (!selectedRoleId) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/role-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRoleId,
          updates: modules.map((m) => ({
            moduleId: m.id,
            canRead: m.canRead,
            canWrite: m.canWrite,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "儲存失敗");
        return;
      }
      setMessage("已儲存，權限生效中");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">角色權限設定</h1>
        <Link
          href="/settings"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回設定區
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-sm text-slate-600">角色</span>
          <select
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}（{r.key}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="h-[38px] rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          重新載入
        </button>
        <button
          type="button"
          onClick={() => void loadRoles()}
          disabled={loading || saving}
          className="h-[38px] rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          重新載入角色
        </button>
        <button
          type="button"
          onClick={async () => {
            const name = window.prompt("輸入新角色名稱");
            if (!name || !name.trim()) return;
            const cloneFromRoleId =
              selectedRoleId && window.confirm("要複製目前角色的權限嗎？")
                ? selectedRoleId
                : undefined;
            setMessage(null);
            const res = await fetch("/api/roles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: name.trim(), cloneFromRoleId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setMessage(data.error || "新增角色失敗");
              return;
            }
            await loadRoles();
            if (data?.role?.id) setSelectedRoleId(String(data.role.id));
            setMessage("已新增角色");
          }}
          disabled={loading || saving}
          className="h-[38px] rounded bg-sky-600 px-3 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          新增角色
        </button>
        {selectedRole ? (
          <button
            type="button"
            onClick={async () => {
              const name = window.prompt("輸入角色新名稱", selectedRole.name);
              if (!name || !name.trim()) return;
              const res = await fetch(`/api/roles/${selectedRole.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setMessage(data.error || "更新角色失敗");
                return;
              }
              await loadRoles();
              setMessage("已更新角色");
            }}
            disabled={loading || saving}
            className="h-[38px] rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            改名
          </button>
        ) : null}
        {selectedRole ? (
          <button
            type="button"
            onClick={async () => {
              if (!confirm("確定要刪除此角色？（若仍有使用者指派會失敗）")) return;
              const res = await fetch(`/api/roles/${selectedRole.id}`, {
                method: "DELETE",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setMessage(data.error || "刪除角色失敗");
                return;
              }
              setMessage("已刪除角色");
              await loadRoles();
            }}
            disabled={loading || saving}
            className="h-[38px] rounded border border-red-200 bg-white px-3 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            刪除角色
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="mb-4 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {message}
        </p>
      ) : null}

      <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 w-[220px] min-w-[220px] bg-slate-50 px-3 py-2">模組</th>
              <th className="sticky left-[220px] z-20 w-[280px] min-w-[280px] bg-slate-50 px-3 py-2">
                描述
              </th>
              <th className="px-3 py-2">權限</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-slate-500">
                  載入中…
                </td>
              </tr>
            ) : modules.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-slate-500">
                  尚無模組資料
                </td>
              </tr>
            ) : (
              (() => {
                const byGroup = new Map<string, ModuleRow[]>();
                for (const m of modules) {
                  const g = m.groupKey || "未分類";
                  const list = byGroup.get(g) ?? [];
                  list.push(m);
                  byGroup.set(g, list);
                }

                const groupKeys = Array.from(byGroup.keys()).sort((a, b) => a.localeCompare(b, "zh-Hant"));

                const rows: React.ReactNode[] = [];
                for (const g of groupKeys) {
                  rows.push(
                    <tr key={`group-${g}`} className="border-b border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-3 py-2 font-semibold text-slate-700">
                        {g}
                      </td>
                    </tr>
                  );

                  const list = byGroup.get(g) ?? [];
                  // Ensure stable order
                  list.sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label, "zh-Hant"));

                  for (const m of list) {
                    const isChild = m.parentId != null;
                    rows.push(
                      <tr key={m.id} className="border-b border-slate-100">
                        <td className="sticky left-0 z-[5] w-[220px] min-w-[220px] bg-white px-3 py-2 font-medium text-slate-800">
                          <span className={isChild ? "pl-6 text-slate-700" : ""}>
                            {isChild ? "└─ " : ""}
                            {m.label}
                          </span>
                        </td>
                        <td className="sticky left-[220px] z-[5] w-[280px] min-w-[280px] bg-white px-3 py-2 text-slate-600">
                          {m.description ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={statusToValue(m.canRead, m.canWrite)}
                            onChange={(e) =>
                              updateModuleStatus(m.id, e.target.value as "none" | "read" | "write")
                            }
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                          >
                            <option value="none">不出現</option>
                            <option value="read">讀取</option>
                            <option value="write">寫入</option>
                          </select>
                        </td>
                      </tr>
                    );
                  }
                }
                return rows;
              })()
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="rounded bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "儲存中…" : "儲存權限"}
        </button>
      </div>
    </div>
  );
}

