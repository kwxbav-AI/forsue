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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/operations/supervisors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, storeIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "建立失敗");
      return;
    }
    setUsername("");
    setPassword("");
    setStoreIds([]);
    await load();
  }

  async function updateStores(supervisorId: string, ids: string[]) {
    const res = await fetch(`/api/operations/supervisors/${supervisorId}/stores`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeIds: ids }),
    });
    if (res.ok) await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <StoreOpsPageHeader
        title="督導設定"
        subtitle="建立督導帳號並綁定負責門市"
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
        onSubmit={(e) => void handleCreate(e)}
        className="mb-8 space-y-3 rounded-xl border bg-white p-4 shadow-sm"
        style={{ borderColor: OPS_COLORS.achievement.border }}
      >
        <h2 className="text-sm font-semibold" style={{ color: OPS_COLORS.achievement.value }}>
          新增督導
        </h2>
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
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm text-white"
          style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
        >
          建立督導
        </button>
      </form>
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-4">
          {items.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.revenue.border }}
            >
              <p className="font-medium" style={{ color: OPS_COLORS.revenue.value }}>
                {s.username}
              </p>
              <p className="mt-1 text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                負責門市：{s.stores.map((x) => x.storeName).join("、") || "（未設定）"}
              </p>
              <button
                type="button"
                className="mt-2 text-xs hover:underline"
                style={{ color: OPS_COLORS.revenue.label }}
                onClick={() => {
                  const picked = window.prompt(
                    "輸入門市 ID（逗號分隔）",
                    s.stores.map((x) => x.storeId).join(",")
                  );
                  if (picked == null) return;
                  void updateStores(
                    s.id,
                    picked.split(",").map((x) => x.trim()).filter(Boolean)
                  );
                }}
              >
                更新負責門市
              </button>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
