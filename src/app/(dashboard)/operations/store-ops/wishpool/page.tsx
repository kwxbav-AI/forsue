"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type WishItem = {
  id: string;
  title: string;
  description: string | null;
  endorseCount: number;
  purchaseReply: string | null;
  store: { storeName: string };
};

export default function StoreOpsWishpoolPage() {
  const { ctx, defaultStoreId } = useStoreOpsContext();
  const [items, setItems] = useState<WishItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  const canReply = ctx?.roleKey === ROLE_KEYS.PURCHASE || ctx?.roleKey === ROLE_KEYS.ADMIN;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operations/store-ops/wishpool");
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
    await fetch("/api/operations/store-ops/wishpool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: defaultStoreId, title, description }),
    });
    setTitle("");
    setDescription("");
    await load();
  }

  async function endorse(id: string) {
    await fetch(`/api/operations/store-ops/wishpool/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "endorse" }),
    });
    await load();
  }

  async function reply(id: string) {
    const text = window.prompt("採購回覆");
    if (!text) return;
    await fetch(`/api/operations/store-ops/wishpool/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchaseReply: text }),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-3xl">
      <StoreOpsPageHeader title="商品許願池" />
      {defaultStoreId ?
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 space-y-2 rounded-xl border bg-white p-4 shadow-sm"
          style={{ borderColor: OPS_COLORS.customer.border }}
        >
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="許願商品"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={2}
            placeholder="說明"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: OPS_COLORS.customer.value }}
          >
            提出許願
          </button>
        </form>
      : null}
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-3">
          {items.map((w) => (
            <li
              key={w.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.customer.border }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium" style={{ color: OPS_COLORS.customer.value }}>
                    {w.title}
                  </p>
                  <p className="text-xs" style={{ color: OPS_COLORS.customer.label }}>
                    {w.store.storeName} · 附議 {w.endorseCount}
                  </p>
                  {w.description ?
                    <p className="mt-1 text-sm text-slate-600">{w.description}</p>
                  : null}
                  {w.purchaseReply ?
                    <p
                      className="mt-2 rounded-lg px-3 py-2 text-sm"
                      style={{
                        backgroundColor: OPS_COLORS.customer.bg,
                        color: OPS_COLORS.customer.value,
                      }}
                    >
                      採購回覆：{w.purchaseReply}
                    </p>
                  : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => void endorse(w.id)}
                    className="rounded-lg border px-3 py-1 text-xs"
                    style={{
                      borderColor: OPS_COLORS.customer.border,
                      color: OPS_COLORS.customer.label,
                    }}
                  >
                    附議
                  </button>
                  {canReply && !w.purchaseReply ?
                    <button
                      type="button"
                      onClick={() => void reply(w.id)}
                      className="rounded-lg px-3 py-1 text-xs text-white"
                      style={{ backgroundColor: OPS_COLORS.customer.value }}
                    >
                      回覆
                    </button>
                  : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
