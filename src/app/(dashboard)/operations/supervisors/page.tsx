"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";

type Supervisor = {
  id: string;
  username: string;
  isActive: boolean;
  stores: { storeId: string; storeName: string; region: string | null }[];
};

type RetailStore = { id: string; storeName: string; region: string | null };

export default function SupervisorsPage() {
  const [items, setItems] = useState<Supervisor[]>([]);
  const [allStores, setAllStores] = useState<RetailStore[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [supRes, storeRes] = await Promise.all([
      fetch("/api/operations/supervisors"),
      fetch("/api/operations/stores?activeOnly=1"),
    ]);
    if (supRes.ok) {
      const d = await supRes.json();
      setItems(d.items ?? []);
    }
    if (storeRes.ok) setAllStores(await storeRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleStore(id: string) {
    setStoreIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function startEdit(s: Supervisor) {
    setEditingId(s.id);
    setUsername(s.username);
    setPassword("");
    setStoreIds(s.stores.map((x) => x.storeId));
    setMessage(null);
  }

  function resetForm() {
    setEditingId(null);
    setUsername("");
    setPassword("");
    setStoreIds([]);
    setMessage(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (storeIds.length === 0) {
      setMessage("請至少選擇一間負責門市");
      return;
    }

    const res = await fetch("/api/operations/supervisors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        ...(password ? { password } : {}),
        storeIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "儲存失敗");
      return;
    }
    setMessage(
      data.updated ? `已更新「${username}」的督導門市綁定` : `已建立督導帳號「${username}」`
    );
    resetForm();
    await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <StoreOpsPageHeader
        title="督導設定"
        subtitle="建立新督導，或為既有帳號綁定負責門市"
        action={
          <Link
            href="/operations/permissions"
            className="text-sm hover:underline"
            style={{ color: OPS_COLORS.revenue.label }}
          >
            權限設定
          </Link>
        }
      />
      {message ?
        <p
          className="mb-4 rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: OPS_COLORS.achievement.border,
            backgroundColor: OPS_COLORS.achievement.bg,
            color: OPS_COLORS.achievement.value,
          }}
        >
          {message}
        </p>
      : null}
      <form
        onSubmit={(e) => void handleSave(e)}
        className="mb-8 space-y-3 rounded-xl border bg-white p-4 shadow-sm"
        style={{ borderColor: OPS_COLORS.achievement.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: OPS_COLORS.achievement.value }}>
          {editingId ? "編輯督導門市" : "新增／設定督導"}
        </h2>
        <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
          帳號已存在時，將設為督導角色並更新門市綁定；密碼可留空（不變更原密碼）。
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="帳號"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={editingId ? "留空則不變更密碼" : "新帳號請設定密碼"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {allStores.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-1 rounded border px-2 py-1 text-xs"
              style={{ borderColor: OPS_COLORS.hours.border, color: OPS_COLORS.hours.label }}
            >
              <input
                type="checkbox"
                checked={storeIds.includes(s.id)}
                onChange={() => toggleStore(s.id)}
              />
              {s.storeName}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
          >
            儲存
          </button>
          {editingId || username || storeIds.length > 0 || password ?
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              onClick={resetForm}
            >
              取消
            </button>
          : null}
        </div>
      </form>
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : items.length === 0 ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          尚無督導帳號，請於上方表單設定。
        </p>
      : <ul className="space-y-4">
          {items.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.revenue.border }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium" style={{ color: OPS_COLORS.revenue.value }}>
                    {s.username}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                    負責門市：{s.stores.map((x) => x.storeName).join("、") || "（未設定）"}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs hover:underline"
                  style={{ color: OPS_COLORS.revenue.label }}
                  onClick={() => startEdit(s)}
                >
                  編輯門市
                </button>
              </div>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
