"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  username: string;
  roleLabel: string;
  roleId: string | null;
  roleKey: string;
  roleName: string | null;
  isActive: boolean;
};

type RoleRow = { id: string; key: string; name: string; isActive: boolean };

function UsersInner() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<Row[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    roleId: "" as string,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [resUsers, resRoles] = await Promise.all([
      fetch("/api/users", { cache: "no-store" }),
      fetch("/api/roles", { cache: "no-store" }),
    ]);
    const dataUsers = await resUsers.json().catch(() => ({}));
    const dataRoles = await resRoles.json().catch(() => ({}));

    if (!resRoles.ok) {
      setMessage(dataRoles.error || "讀取角色失敗");
      setRoles([]);
    } else {
      const list = Array.isArray(dataRoles.roles) ? (dataRoles.roles as RoleRow[]) : [];
      setRoles(list);
      if (!form.roleId && list.length > 0) {
        const editor = list.find((r) => r.key === "EDITOR") ?? list[0];
        setForm((f) => ({ ...f, roleId: editor?.id ?? "" }));
      }
    }

    if (!resUsers.ok) {
      setMessage(dataUsers.error || "讀取失敗");
      setUsers([]);
    } else {
      setUsers(dataUsers.users || []);
      setMessage(null);
    }
    setLoading(false);
  }, [form.roleId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("created") === "1") {
      setMessage("已建立帳號");
    }
  }, [searchParams]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "建立失敗");
      return;
    }
    setForm((prev) => ({ username: "", password: "", roleId: prev.roleId }));
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

      <p className="mb-4 text-sm text-slate-600">
        <strong>管理員</strong>：全部功能與本頁。 <strong>編輯者</strong>：上傳、填報、門市與設定（不含帳號）。
        <strong>檢視者</strong>：僅報表與工效查詢（唯讀）。
      </p>

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
                setForm((f) => ({ ...f, roleId: e.target.value }))
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
      </form>

      <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="sticky left-0 z-20 w-[180px] min-w-[180px] bg-slate-50 px-3 py-2">
                帳號
              </th>
              <th className="sticky left-[180px] z-20 w-[140px] min-w-[140px] bg-slate-50 px-3 py-2">
                角色
              </th>
              <th className="px-3 py-2">狀態</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  載入中…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
                  尚無帳號
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="sticky left-0 z-[5] w-[180px] min-w-[180px] bg-white px-3 py-2 font-medium">
                    {u.username}
                  </td>
                  <td className="sticky left-[180px] z-[5] w-[140px] min-w-[140px] bg-white px-3 py-2">
                    <select
                      value={u.roleId ?? ""}
                      onChange={(e) =>
                        void patchUser(u.id, { roleId: e.target.value })
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}（{r.key}）
                        </option>
                      ))}
                    </select>
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
                        onClick={() =>
                          void patchUser(u.id, { isActive: !u.isActive })
                        }
                      >
                        {u.isActive ? "停用" : "啟用"}
                      </button>
                    </div>
                  </td>
                </tr>
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
