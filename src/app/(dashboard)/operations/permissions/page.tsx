"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";

type UserRow = {
  id: string;
  username: string;
  roleId: string | null;
  roleKey: string;
  roleLabel: string;
  isActive: boolean;
  retailStoreId?: string | null;
};

type Role = { id: string; key: string; name: string };
type Store = { id: string; storeName: string };

export default function OperationsPermissionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, rRes, sRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/roles"),
      fetch("/api/operations/stores?activeOnly=1"),
    ]);
    if (uRes.ok) {
      const d = await uRes.json();
      setUsers(d.users ?? []);
    }
    if (rRes.ok) {
      const d = await rRes.json();
      setRoles(d.roles ?? []);
    }
    if (sRes.ok) setStores(await sRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchUser(id: string, body: Record<string, unknown>) {
    setMessage(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "更新失敗");
      return;
    }
    await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <StoreOpsPageHeader
        title="權限設定"
        subtitle="帳號角色指派與門市綁定"
        action={
          <Link
            href="/settings/role-permissions"
            className="text-sm hover:underline"
            style={{ color: OPS_COLORS.revenue.label }}
          >
            模組權限矩陣
          </Link>
        }
      />
      {message ?
        <p
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: OPS_COLORS.status.unmet.border,
            backgroundColor: OPS_COLORS.status.unmet.bg,
            color: OPS_COLORS.status.unmet.value,
          }}
        >
          {message}
        </p>
      : null}
      <p className="mb-4 text-sm" style={{ color: OPS_COLORS.achievement.label }}>
        督導門市綁定請至{" "}
        <Link href="/operations/supervisors" className="hover:underline" style={{ color: OPS_COLORS.revenue.label }}>
          督導設定
        </Link>
        。
      </p>
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <div
          className="overflow-x-auto rounded-xl border bg-white shadow-sm"
          style={{ borderColor: OPS_COLORS.revenue.border }}
        >
          <table className="min-w-full text-sm">
            <thead
              className="text-left text-xs"
              style={{ backgroundColor: OPS_COLORS.revenue.bg, color: OPS_COLORS.revenue.label }}
            >
              <tr>
                <th className="px-4 py-2">帳號</th>
                <th className="px-4 py-2">角色</th>
                <th className="px-4 py-2">綁定門市</th>
                <th className="px-4 py-2">狀態</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: OPS_COLORS.revenue.border }}>
                  <td className="px-4 py-2 font-mono" style={{ color: OPS_COLORS.revenue.value }}>
                    {u.username}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                      value={u.roleId ?? ""}
                      onChange={(e) => void patchUser(u.id, { roleId: e.target.value })}
                    >
                      <option value="">—</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.key})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {u.roleKey === "STORE_STAFF" ?
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                        value={u.retailStoreId ?? ""}
                        onChange={(e) =>
                          void patchUser(u.id, { retailStoreId: e.target.value || null })
                        }
                      >
                        <option value="">未綁定</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.storeName}
                          </option>
                        ))}
                      </select>
                    : <span className="text-xs" style={{ color: OPS_COLORS.status.none.label }}>
                        —
                      </span>}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-xs"
                      style={{
                        color: u.isActive ? OPS_COLORS.status.met.value : OPS_COLORS.status.unmet.value,
                      }}
                      onClick={() => void patchUser(u.id, { isActive: !u.isActive })}
                    >
                      {u.isActive ? "啟用中" : "已停用"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}
