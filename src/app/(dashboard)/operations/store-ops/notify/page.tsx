"use client";

import { useEffect, useState } from "react";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type Notification = {
  id: string;
  type: string;
  title: string;
  meta: Record<string, unknown>;
  status: string;
  createdAt: string;
};

function typeAccent(type: string) {
  if (type.includes("SUPPLY")) return OPS_COLORS.achievement;
  if (type.includes("REPAIR")) return OPS_COLORS.status.unmet;
  if (type.includes("JOURNAL")) return OPS_COLORS.hours;
  return OPS_COLORS.revenue;
}

export default function StoreOpsNotifyPage() {
  const { ctx } = useStoreOpsContext();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/operations/store-ops/notifications")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <StoreOpsPageHeader
        title="通知中心"
        subtitle={ctx ? `角色：${ctx.roleKey} · ${items.length} 則待處理` : undefined}
      />
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : items.length === 0 ?
        <p
          className="rounded-xl border p-8 text-center text-sm"
          style={{
            borderColor: OPS_COLORS.achievement.border,
            backgroundColor: OPS_COLORS.achievement.bg,
            color: OPS_COLORS.achievement.label,
          }}
        >
          目前沒有待處理通知
        </p>
      : <ul className="space-y-2">
          {items.map((n) => {
            const accent = typeAccent(n.type);
            return (
              <li
                key={n.id}
                className="rounded-xl border bg-white px-4 py-3 shadow-sm"
                style={{ borderColor: accent.border }}
              >
                <p className="font-medium" style={{ color: accent.value }}>
                  {n.title}
                </p>
                <p className="mt-1 text-xs" style={{ color: accent.label }}>
                  {n.type} · {new Date(n.createdAt).toLocaleString("zh-TW")}
                </p>
              </li>
            );
          })}
        </ul>
      }
    </div>
  );
}
