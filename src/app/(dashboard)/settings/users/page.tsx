"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type SupervisorStore = { storeId: string; storeName: string; region: string | null };

type UserRow = {
  id: string;
  username: string;
  roleLabel: string;
  roleId: string | null;
  roleKey: string;
  roleName: string | null;
  retailStoreId: string | null;
  retailStore: { id: string; storeName: string } | null;
  supervisorStores: SupervisorStore[];
  isActive: boolean;
};

type RoleRow = { id: string; key: string; name: string; isActive: boolean };
type RetailStoreRow = { id: string; storeName: string; region: string | null };

type CreateForm = {
  username: string;
  password: string;
  roleId: string;
  retailStoreId: string;
  supervisorStoreIds: string[];
};

function isSupervisorRole(key: string) {
  return key === "SUPERVISOR";
}

function isStoreStaffRole(key: string) {
  return key === "STORE_STAFF";
}

function StoreCheckboxGrid({
  stores,
  selected,
  onChange,
}: {
  stores: RetailStoreRow[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const byRegion = stores.reduce<Record<string, RetailStoreRow[]>>((acc, s) => {
    const r = s.region ?? "其他";
    (acc[r] ??= []).push(s);
    return acc;
  }, {});

  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  }

  return (
    <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      {Object.entries(byRegion).map(([region, list]) => (
        <div key={region}>
          <div className="mb-1 font-semibold text-slate-600">{region}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {list.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-3.5 w-3.5"
                />
                <span>{s.storeName}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserStoreEditor({
  user,
  stores,
  roles,
  onSaved,
  onMessage,
}: {
  user: UserRow;
  stores: RetailStoreRow[];
  roles: RoleRow[];
  onSaved: () => void;
  onMessage: (msg: string) => void;
}) {
  const [supervisorIds, setSupervisorIds] = useState<string[]>(
    user.supervisorStores.map((s) => s.storeId)
  );
  const [retailStoreId, setRetailStoreId] = useState<string>(
    user.retailStoreId ?? ""
  );
  const [saving, setSaving] = useState(false);

  const roleKey = roles.find((r) => r.id === user.roleId)?.key ?? user.roleKey;

  async function save() {
    setSaving(true);
    const patch: Record<string, unknown> = {};
    if (isSupervisorRole(roleKey)) {
      patch.supervisorStoreIds = supervisorIds;
    } else if (isStoreStaffRole(roleKey)) {
      patch.retailStoreId = retailStoreId || null;
    }
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      onMessage(data.error || "更新失敗");
    } else {
      onMessage("已更新門市設定");
      onSaved();
    }
  }

  if (!isSupervisorRole(roleKey) && !isStoreStaffRole(roleKey)) {
    return <p className="text-xs text-slate-400">此角色無需門市設定</p>;
  }

  return (
    <div className="space-y-3">
      {isSupervisorRole(roleKey) && (
        <>
          <p className="text-xs text-slate-600">
            督導負責門市（可多選，已選 {supervisorIds.length} 間）
          </p>
          <StoreCheckboxGrid stores={stores} selected={supervisorIds} onChange={setSupervisorIds} />
        </>
      )}
      {isStoreStaffRole(roleKey) && (
        <label className="block text-xs text-slate-600">
          所屬門市
          <select
            value={retailStoreId}
            onChange={(e) => setRetailStoreId(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">— 未設定 —</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
                {s.region ? ` (${s.region})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded bg-sky-600 px-3 py-1 text-xs text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {saving ? "儲存中…" : "儲存門市設定"}
      </button>
    </div>
  );
}

function UsersInner() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [stores, setStores] = useState<RetailStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({
    username: "",
    password: "",
    roleId: "",
    retailStoreId: "",
    supervisorStoreIds: [],
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [resUsers, resRoles, resStores] = await Promise.all([
      fetch("/api/users", { cache: "no-store" }),
      fetch("/api/roles", { cache: "no-store" }),
      fetch("/api/operations/stores?activeOnly=1", { cache: "no-store" }),
    ]);
    const dataUsers = await resUsers.json().catch(() => ({}));
    const dataRoles = await resRoles.json().catch(() => ({}));
    const dataStores = await resStores.json().catch(() => ([]));

    if (resRoles.ok) {
      const list = Array.isArray(dataRoles.roles) ? (dataRoles.roles as RoleRow[]) : [];
      setRoles(list);
      setForm((f) => ({
        ...f,
        roleId: f.roleId || list.find((r) => r.key === "STORE_STAFF")?.id || list[0]?.id || "",
      }));
    }
    if (resStores.ok) {
      setStores(Array.isArray(dataStores) ? dataStores : []);
    }
    if (resUsers.ok) {
      setUsers(dataUsers.users || []);
      setMessage(null);
    } else {
      setMessage(dataUsers.error || "讀取失敗");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (searchParams.get("created") === "1") setMessage("已建立帳號");
  }, [searchParams]);

  const selectedRoleKey = roles.find((r) => r.id === form.roleId)?.key ?? "";

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const body: Record<string, unknown> = {
      username: form.username,
      password: form.password,
      roleId: form.roleId,
    };
    if (isSupervisorRole(selectedRoleKey) && form.supervisorStoreIds.length > 0) {
      body.supervisorStoreIds = form.supervisorStoreIds;
    }
    if (isStoreStaffRole(selectedRoleKey) && form.retailStoreId) {
      body.retailStoreId = form.retailStoreId;
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "建立失敗");
      return;
    }
    setForm((prev) => ({
      username: "",
      password: "",
      roleId: prev.roleId,
      retailStoreId: "",
      supervisorStoreIds: [],
    }));
    await load();
    setMessage("已建立帳號");
  }

  async function patchUser(
    id: string,
    patch: Partial<{ password: string; roleId: string; isActive: boolean }>
  ) {
    setMessage(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "更新失敗");
      return;
    }
    await load();
    setMessage("已更新");
  }

  function storeLabel(u: UserRow) {
    const key = roles.find((r) => r.id === u.roleId)?.key ?? u.roleKey;
    if (isSupervisorRole(key)) {
      if (u.supervisorStores.length === 0) return <span className="text-slate-400">未設定</span>;
      return <span className="text-slate-700">{u.supervisorStores.length} 間門市</span>;
    }
    if (isStoreStaffRole(key)) {
      return u.retailStore
        ? <span className="text-slate-700">{u.retailStore.storeName}</span>
        : <span className="text-slate-400">未設定</span>;
    }
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-800">帳號與權限</h1>
        <Link
          href="/settings"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回設定區
        </Link>
      </div>

      {message ? (
        <p className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          {message}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void createUser(e)}
        className="mb-8 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">新增帳號</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-slate-500">帳號</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
              required
              minLength={2}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">密碼</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
              required
              minLength={6}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">角色</span>
            <select
              value={form.roleId}
              onChange={(e) =>
                setForm((f) => ({ ...f, roleId: e.target.value, retailStoreId: "", supervisorStoreIds: [] }))
              }
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
            type="submit"
            className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700"
          >
            建立
          </button>
        </div>

        {isSupervisorRole(selectedRoleKey) && (
          <div className="mt-4 space-y-1">
            <p className="text-xs text-slate-600">
              督導負責門市（可多選，已選 {form.supervisorStoreIds.length} 間）
            </p>
            <StoreCheckboxGrid
              stores={stores}
              selected={form.supervisorStoreIds}
              onChange={(ids) => setForm((f) => ({ ...f, supervisorStoreIds: ids }))}
            />
          </div>
        )}

        {isStoreStaffRole(selectedRoleKey) && (
          <div className="mt-4">
            <label className="block text-xs text-slate-600">
              所屬門市
              <select
                value={form.retailStoreId}
                onChange={(e) => setForm((f) => ({ ...f, retailStoreId: e.target.value }))}
                className="mt-1 block rounded border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="">— 未設定 —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.storeName}{s.region ? ` (${s.region})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </form>

      <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 w-[160px] min-w-[160px] bg-slate-50 px-3 py-2">帳號</th>
              <th className="sticky left-[160px] z-20 w-[130px] min-w-[130px] bg-slate-50 px-3 py-2">角色</th>
              <th className="px-3 py-2">門市設定</th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">載入中…</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-500">尚無帳號</td>
              </tr>
            ) : (
              users.map((u) => (
                <>
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[160px] min-w-[160px] bg-white px-3 py-2 font-medium">
                      {u.username}
                    </td>
                    <td className="sticky left-[160px] z-[5] w-[130px] min-w-[130px] bg-white px-3 py-2">
                      <select
                        value={u.roleId ?? ""}
                        onChange={(e) => void patchUser(u.id, { roleId: e.target.value })}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}（{r.key}）
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                        className="flex items-center gap-1 text-sky-700 hover:underline"
                      >
                        {storeLabel(u)}
                        <span className="text-slate-400">{expandedId === u.id ? "▲" : "▼"}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {u.isActive ? (
                        <span className="text-emerald-700">啟用</span>
                      ) : (
                        <span className="text-slate-500">停用</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs text-sky-700 hover:underline"
                          onClick={() => {
                            const p = window.prompt("輸入新密碼（至少 6 字元）");
                            if (p && p.length >= 6) void patchUser(u.id, { password: p });
                          }}
                        >
                          重設密碼
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-600 hover:underline"
                          onClick={() => void patchUser(u.id, { isActive: !u.isActive })}
                        >
                          {u.isActive ? "停用" : "啟用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === u.id && (
                    <tr key={`${u.id}-expand`} className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-6 py-3">
                        <UserStoreEditor
                          user={u}
                          stores={stores}
                          roles={roles}
                          onSaved={() => void load()}
                          onMessage={setMessage}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">載入中…</p>}>
      <UsersInner />
    </Suspense>
  );
}
