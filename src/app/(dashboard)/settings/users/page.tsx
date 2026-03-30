"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { USER_ROLE_LABELS } from "@/lib/permissions";

type UserRole = keyof typeof USER_ROLE_LABELS;

type Row = {
  id: string;
  username: string;
  role: UserRole;
  roleLabel: string;
  isActive: boolean;
};

const ROLES = Object.keys(USER_ROLE_LABELS) as UserRole[];

function UsersInner() {
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "EDITOR" as UserRole,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "讀取失敗");
      setUsers([]);
    } else {
      setUsers(data.users || []);
      setMessage(null);
    }
    setLoading(false);
  }, []);

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
    setForm({ username: "", password: "", role: "EDITOR" });
    await load();
    setMessage("已建立帳號");
  }

  async function patchUser(
    id: string,
    patch: Partial<{ password: string; role: UserRole; isActive: boolean }>
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
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as UserRole }))
              }
              className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
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

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2">帳號</th>
              <th className="px-3 py-2">角色</th>
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
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">
                    <select
                      defaultValue={u.role}
                      onChange={(e) =>
                        void patchUser(u.id, { role: e.target.value as UserRole })
                      }
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {USER_ROLE_LABELS[r]}
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
