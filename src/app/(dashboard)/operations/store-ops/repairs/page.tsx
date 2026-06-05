"use client";

import { useCallback, useEffect, useState } from "react";
import { OPS_COLORS, getStatusColor } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type Repair = {
  id: string;
  equipment: string;
  description: string | null;
  status: string;
  createdAt: string;
  store: { storeName: string };
};

export default function StoreOpsRepairsPage() {
  const { defaultStoreId } = useStoreOpsContext();
  const [items, setItems] = useState<Repair[]>([]);
  const [equipment, setEquipment] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operations/store-ops/repairs");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultStoreId) return;
    await fetch("/api/operations/store-ops/repairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: defaultStoreId, equipment, description }),
    });
    setEquipment("");
    setDescription("");
    await load();
  }

  async function resolve(id: string) {
    await fetch(`/api/operations/store-ops/repairs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-3xl">
      <StoreOpsPageHeader title="報修追蹤" />
      {defaultStoreId ?
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 space-y-2 rounded-xl border bg-white p-4 shadow-sm"
          style={{ borderColor: OPS_COLORS.status.unmet.border }}
        >
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="設備名稱"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            placeholder="問題描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: OPS_COLORS.status.unmet.value }}
          >
            新增報修
          </button>
        </form>
      : null}
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-2">
          {items.map((r) => {
            const resolved = r.status === "RESOLVED";
            const statusStyle = getStatusColor(resolved ? "met" : "unmet");
            return (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
                style={{ borderColor: statusStyle.border }}
              >
                <div>
                  <p className="font-medium" style={{ color: OPS_COLORS.achievement.value }}>
                    {r.equipment} · {r.store.storeName}
                  </p>
                  <p className="text-xs font-medium" style={{ color: statusStyle.value }}>
                    {r.status}
                  </p>
                  {r.description ?
                    <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                  : null}
                </div>
                {!resolved ?
                  <button
                    type="button"
                    onClick={() => void resolve(r.id)}
                    className="shrink-0 rounded-lg border px-3 py-1 text-xs"
                    style={{
                      borderColor: OPS_COLORS.status.met.border,
                      color: OPS_COLORS.status.met.value,
                      backgroundColor: OPS_COLORS.status.met.bg,
                    }}
                  >
                    結案
                  </button>
                : null}
              </li>
            );
          })}
        </ul>
      }
    </div>
  );
}
