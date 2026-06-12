"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { SupplyFlowBadge } from "@/components/operations/SupplyFlowBadge";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type SupplyRequest = {
  id: string;
  itemName: string;
  quantity: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SHIPPED" | "RECEIVED";
  submittedAt: string;
  reviewedAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  rejectReason: string | null;
  store: { storeName: string };
};

export default function StoreOpsSupplyPage() {
  const { ctx, defaultStoreId } = useStoreOpsContext();
  const [items, setItems] = useState<SupplyRequest[]>([]);
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [loading, setLoading] = useState(true);

  const role = ctx?.roleKey;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operations/store-ops/supply");
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
    await fetch("/api/operations/store-ops/supply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: defaultStoreId, itemName, quantity }),
    });
    setItemName("");
    setQuantity("");
    await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/operations/store-ops/supply/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      <StoreOpsPageHeader title="物資申請" subtitle="已提出 → 督導審核 → 總務配送 → 門市確認" />
      {(role === ROLE_KEYS.STORE_STAFF || role === ROLE_KEYS.ADMIN) && defaultStoreId ?
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="mb-6 flex flex-wrap gap-2 rounded-xl border bg-white p-4 shadow-sm"
          style={{ borderColor: OPS_COLORS.achievement.border }}
        >
          <input
            className="min-w-[160px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="品項名稱"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
          <input
            className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="數量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
          >
            提出申請
          </button>
        </form>
      : null}
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-4">
          {items.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.achievement.border }}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium" style={{ color: OPS_COLORS.achievement.value }}>
                    {s.itemName}
                    {s.quantity ? ` × ${s.quantity}` : ""}
                  </p>
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    {s.store.storeName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {s.status === "PENDING" && (role === ROLE_KEYS.SUPERVISOR || role === ROLE_KEYS.ADMIN) ?
                    <>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1 text-xs text-white"
                        style={{ backgroundColor: OPS_COLORS.status.met.value }}
                        onClick={() => void patch(s.id, { action: "approve" })}
                      >
                        核准
                      </button>
                      <button
                        type="button"
                        className="rounded-lg px-3 py-1 text-xs text-white"
                        style={{ backgroundColor: OPS_COLORS.status.unmet.value }}
                        onClick={() => {
                          const reason = window.prompt("退回原因");
                          if (reason) void patch(s.id, { action: "reject", rejectReason: reason });
                        }}
                      >
                        退回
                      </button>
                    </>
                  : null}
                  {s.status === "APPROVED" && role === ROLE_KEYS.ADMIN ?
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1 text-xs text-white"
                      style={{ backgroundColor: OPS_COLORS.revenue.value }}
                      onClick={() => void patch(s.id, { action: "ship" })}
                    >
                      出貨
                    </button>
                  : null}
                  {s.status === "SHIPPED" && (role === ROLE_KEYS.STORE_STAFF || role === ROLE_KEYS.ADMIN) ?
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1 text-xs text-white"
                      style={{ backgroundColor: OPS_COLORS.hours.chartDeep }}
                      onClick={() => void patch(s.id, { action: "receive" })}
                    >
                      確認收到
                    </button>
                  : null}
                </div>
              </div>
              <div className="mt-3">
                <SupplyFlowBadge
                  status={s.status}
                  submittedAt={s.submittedAt}
                  reviewedAt={s.reviewedAt}
                  shippedAt={s.shippedAt}
                  receivedAt={s.receivedAt}
                  rejectReason={s.rejectReason}
                />
              </div>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
