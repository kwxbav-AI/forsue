"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { formatLocalDateInput } from "@/lib/date";
import { OPS_COLORS, getStatusColor } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type TodoItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  store: { storeName: string; region: string | null };
};

export default function StoreOpsTasksPage() {
  const { ctx, defaultStoreId } = useStoreOpsContext();
  const [items, setItems] = useState<TodoItem[]>([]);
  const [storeId, setStoreId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(true);

  const canAssign =
    ctx?.roleKey === ROLE_KEYS.ADMIN || ctx?.roleKey === ROLE_KEYS.SUPERVISOR;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    const res = await fetch(`/api/operations/store-ops/tasks?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (defaultStoreId && !storeId) setStoreId(defaultStoreId);
  }, [defaultStoreId, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const sid = canAssign ? storeId : defaultStoreId;
    if (!sid) return;
    await fetch("/api/operations/store-ops/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: sid, title, dueDate: dueDate || null }),
    });
    setTitle("");
    setDueDate("");
    await load();
  }

  async function markDone(id: string) {
    await fetch(`/api/operations/store-ops/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-3xl">
      <StoreOpsPageHeader title="任務待辦" />
      {canAssign && (ctx?.stores.length ?? 0) > 1 ?
        <select
          className="mb-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          {(ctx?.stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.storeName}
            </option>
          ))}
        </select>
      : null}
      <form
        onSubmit={(e) => void handleCreate(e)}
        className="mb-6 flex flex-wrap gap-2 rounded-xl border bg-white p-4 shadow-sm"
        style={{ borderColor: OPS_COLORS.achievement.border }}
      >
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="任務標題"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          type="date"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          min={formatLocalDateInput()}
        />
        <button
          type="submit"
          className="rounded-lg px-4 py-2 text-sm text-white"
          style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
        >
          新增
        </button>
      </form>
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-2">
          {items.map((t) => {
            const done = t.status === "DONE";
            const statusStyle = getStatusColor(done ? "met" : "unmet");
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm"
                style={{ borderColor: done ? statusStyle.border : OPS_COLORS.achievement.border }}
              >
                <div>
                  <p className="font-medium" style={{ color: OPS_COLORS.achievement.value }}>
                    {t.title}
                  </p>
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    {t.store.storeName} ·{" "}
                    <span style={{ color: statusStyle.value }}>{t.status}</span>
                    {t.dueDate ? ` · 期限 ${t.dueDate}` : ""}
                  </p>
                </div>
                {!done ?
                  <button
                    type="button"
                    onClick={() => void markDone(t.id)}
                    className="rounded-lg border px-3 py-1 text-xs"
                    style={{
                      borderColor: OPS_COLORS.status.met.border,
                      color: OPS_COLORS.status.met.value,
                      backgroundColor: OPS_COLORS.status.met.bg,
                    }}
                  >
                    完成
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
