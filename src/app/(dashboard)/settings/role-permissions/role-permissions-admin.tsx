"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Role = { id: string; key: string; name: string; isActive: boolean };
type Module = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  groupKey: string;
  sortOrder: number;
  parentId: string | null;
};
type PermValue = "none" | "read" | "write";
// roleId → moduleId → PermValue
type PermMatrix = Record<string, Record<string, PermValue>>;

function toPermValue(canRead: boolean, canWrite: boolean): PermValue {
  if (canWrite) return "write";
  if (canRead) return "read";
  return "none";
}

const PERM_CYCLE: PermValue[] = ["none", "read", "write"];

const PERM_STYLE: Record<PermValue, { bg: string; text: string; icon: string; label: string }> = {
  none: { bg: "#F1EFE8", text: "#5F5E5A", icon: "ti-eye-off", label: "隱藏" },
  read: { bg: "#E6F1FB", text: "#185FA5", icon: "ti-eye",     label: "檢視" },
  write:{ bg: "#EAF3DE", text: "#3B6D11", icon: "ti-pencil",  label: "操作" },
};

export default function RolePermissionsAdmin() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [matrix, setMatrix] = useState<PermMatrix>({});
  // 記錄哪些 roleId 有未存變更
  const [dirtyRoles, setDirtyRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/role-permissions/all", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ type: "err", text: data.error || "載入失敗" }); return; }

      const rawRoles: Role[] = Array.isArray(data.roles) ? data.roles : [];
      const rawModules: Module[] = Array.isArray(data.modules) ? data.modules : [];
      const rawPerms: Record<string, Record<string, { canRead: boolean; canWrite: boolean }>> =
        data.permissions ?? {};

      const m: PermMatrix = {};
      for (const r of rawRoles) {
        m[r.id] = {};
        for (const mod of rawModules) {
          const p = rawPerms[r.id]?.[mod.id] ?? { canRead: false, canWrite: false };
          m[r.id][mod.id] = toPermValue(p.canRead, p.canWrite);
        }
      }
      setRoles(rawRoles);
      setModules(rawModules);
      setMatrix(m);
      setDirtyRoles(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function cycleCell(roleId: string, moduleId: string) {
    setMatrix((prev) => {
      const cur = prev[roleId]?.[moduleId] ?? "none";
      const next = PERM_CYCLE[(PERM_CYCLE.indexOf(cur) + 1) % 3];
      return { ...prev, [roleId]: { ...prev[roleId], [moduleId]: next } };
    });
    setDirtyRoles((prev) => new Set(prev).add(roleId));
  }

  async function save() {
    if (dirtyRoles.size === 0) { setMessage({ type: "ok", text: "沒有變更" }); return; }
    setSaving(true);
    setMessage(null);
    try {
      for (const roleId of dirtyRoles) {
        const mods = modules.map((m) => {
          const v = matrix[roleId]?.[m.id] ?? "none";
          return { moduleId: m.id, canRead: v !== "none", canWrite: v === "write" };
        });
        const res = await fetch("/api/role-permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roleId, updates: mods }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage({ type: "err", text: data.error || "儲存失敗" }); return; }
      }
      setDirtyRoles(new Set());
      setMessage({ type: "ok", text: `已儲存 ${dirtyRoles.size} 個角色的權限` });
    } finally {
      setSaving(false);
    }
  }

  async function addRole() {
    const name = window.prompt("輸入新角色名稱");
    if (!name?.trim()) return;
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage({ type: "err", text: data.error || "新增失敗" }); return; }
    await load();
  }

  async function renameRole(role: Role) {
    const name = window.prompt("輸入角色新名稱", role.name);
    if (!name?.trim()) return;
    const res = await fetch(`/api/roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage({ type: "err", text: data.error || "改名失敗" }); return; }
    await load();
  }

  async function deleteRole(role: Role) {
    if (!confirm(`確定要刪除角色「${role.name}」？（若仍有使用者指派會失敗）`)) return;
    const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage({ type: "err", text: data.error || "刪除失敗" }); return; }
    await load();
  }

  // 依 groupKey 分組，維持 sortOrder
  const groups: { key: string; modules: Module[] }[] = [];
  {
    const map = new Map<string, Module[]>();
    for (const m of modules) {
      const g = m.groupKey || "其他";
      const list = map.get(g) ?? [];
      list.push(m);
      map.set(g, list);
    }
    for (const [key, list] of map) {
      list.sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label, "zh-Hant"));
      groups.push({ key, modules: list });
    }
    groups.sort((a, b) => a.key.localeCompare(b.key, "zh-Hant"));
  }

  const colW = Math.max(100, Math.min(140, Math.floor(480 / Math.max(roles.length, 1))));

  return (
    <div>
      {/* 標題列 */}
      <div className="mb-4 flex items-center gap-3">
        <h1 className="flex-1 text-xl font-bold text-slate-800">角色權限矩陣</h1>
        <button
          type="button"
          onClick={addRole}
          disabled={loading || saving}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          新增角色
        </button>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || saving}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          重新載入
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading || dirtyRoles.size === 0}
          className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-40"
        >
          {saving ? "儲存中…" : dirtyRoles.size > 0 ? `儲存變更（${dirtyRoles.size}）` : "儲存變更"}
        </button>
        <Link
          href="/settings"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回設定區
        </Link>
      </div>

      {/* 訊息 */}
      {message && (
        <p className={`mb-3 rounded border px-3 py-2 text-sm ${
          message.type === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-800"
        }`}>
          {message.text}
        </p>
      )}

      {/* 圖例 */}
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        <span>點格子切換權限：</span>
        {(["none","read","write"] as PermValue[]).map((v) => {
          const s = PERM_STYLE[v];
          return (
            <span key={v} className="flex items-center gap-1">
              <span style={{ background: s.bg, color: s.text }}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                <i className={`ti ${s.icon}`} aria-hidden />
                {s.label}
              </span>
            </span>
          );
        })}
        {dirtyRoles.size > 0 && (
          <span className="ml-auto font-medium text-amber-600">
            {dirtyRoles.size} 個角色有未儲存的變更
          </span>
        )}
      </div>

      {/* 矩陣表格 */}
      <div className="relative overflow-auto rounded-lg border border-slate-200 shadow-sm"
           style={{ maxHeight: "72vh" }}>
        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-500">載入中…</p>
        ) : (
          <table className="border-collapse text-sm" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              <col style={{ width: 200 }} />
              {roles.map((r) => <col key={r.id} style={{ width: colW }} />)}
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr>
                {/* 左上角固定 */}
                <th className="sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500">
                  功能模組
                </th>
                {roles.map((r) => (
                  <th key={r.id}
                      className="border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-center last:border-r-0">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`text-xs font-medium ${dirtyRoles.has(r.id) ? "text-amber-600" : "text-slate-700"}`}>
                        {r.name}
                        {dirtyRoles.has(r.id) && <span className="ml-1 text-amber-500">●</span>}
                      </span>
                      <span className="text-[10px] text-slate-400">{r.key}</span>
                      <div className="flex gap-1 mt-0.5">
                        <button
                          onClick={() => renameRole(r)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200"
                          title="改名">
                          改名
                        </button>
                        <button
                          onClick={() => deleteRole(r)}
                          className="rounded px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-50"
                          title="刪除">
                          刪除
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, modules: mods }) => (
                <>
                  {/* 分組標題列 */}
                  <tr key={`g-${key}`}>
                    <td colSpan={roles.length + 1}
                        className="sticky left-0 border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {key}
                    </td>
                  </tr>
                  {mods.map((m) => (
                    <tr key={m.id} className="group hover:bg-slate-50/60">
                      {/* 模組名稱（fixed left） */}
                      <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-1.5 group-hover:bg-slate-50/80">
                        <div className={m.parentId ? "pl-5" : ""}>
                          <span className="text-slate-700">
                            {m.parentId ? <span className="mr-1 text-slate-400">└</span> : null}
                            {m.label}
                          </span>
                          {m.description && (
                            <p className="mt-0.5 text-[11px] leading-tight text-slate-400">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </td>
                      {/* 每個角色的格子 */}
                      {roles.map((r) => {
                        const v = matrix[r.id]?.[m.id] ?? "none";
                        const s = PERM_STYLE[v];
                        return (
                          <td key={r.id}
                              className="border-b border-r border-slate-100 p-0 last:border-r-0"
                              style={{ height: 44 }}>
                            <button
                              type="button"
                              onClick={() => cycleCell(r.id, m.id)}
                              title="點擊切換：隱藏 → 檢視 → 操作"
                              style={{ background: s.bg, color: s.text }}
                              className="flex h-full w-full cursor-pointer items-center justify-center gap-1 text-xs font-medium transition-opacity hover:opacity-80 active:opacity-60">
                              <i className={`ti ${s.icon}`} aria-hidden style={{ fontSize: 13 }} />
                              {s.label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
