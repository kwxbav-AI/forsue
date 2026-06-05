"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { OPS_COLORS } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";

type Announcement = {
  id: string;
  title: string;
  content: string;
  targetType: string;
  targetRegion: string | null;
  publishedBy: string | null;
  createdAt: string;
};

export default function StoreOpsBulletinPage() {
  const { ctx } = useStoreOpsContext();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetType, setTargetType] = useState<"ALL" | "REGION" | "STORE">("ALL");
  const [targetRegion, setTargetRegion] = useState("");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [loading, setLoading] = useState(true);

  const canPublish =
    ctx?.roleKey === ROLE_KEYS.ADMIN || ctx?.roleKey === ROLE_KEYS.SUPERVISOR;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/operations/store-ops/announcements");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/operations/store-ops/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        targetType,
        targetRegion: targetType === "REGION" ? targetRegion : null,
        targetStoreId: targetType === "STORE" ? targetStoreId : null,
      }),
    });
    if (res.ok) {
      setTitle("");
      setContent("");
      await load();
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <StoreOpsPageHeader title="公佈欄" subtitle="全區／區域／門市公告" />
      {canPublish ?
        <form
          onSubmit={(e) => void handlePublish(e)}
          className="mb-6 space-y-3 rounded-xl border bg-white p-4 shadow-sm"
          style={{ borderColor: OPS_COLORS.achievement.border }}
        >
          <h2 className="text-sm font-semibold" style={{ color: OPS_COLORS.achievement.value }}>
            發佈公告
          </h2>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="標題"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="內容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as typeof targetType)}
          >
            <option value="ALL">全公司</option>
            <option value="REGION">區域</option>
            <option value="STORE">門市</option>
          </select>
          {targetType === "REGION" ?
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="區域（如：桃園區）"
              value={targetRegion}
              onChange={(e) => setTargetRegion(e.target.value)}
            />
          : null}
          {targetType === "STORE" ?
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={targetStoreId}
              onChange={(e) => setTargetStoreId(e.target.value)}
            >
              <option value="">選擇門市</option>
              {(ctx?.stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                </option>
              ))}
            </select>
          : null}
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm text-white"
            style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
          >
            發佈
          </button>
        </form>
      : null}
      {loading ?
        <p className="text-sm" style={{ color: OPS_COLORS.status.none.label }}>
          載入中…
        </p>
      : <ul className="space-y-3">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.revenue.border }}
            >
              <h3 className="font-semibold" style={{ color: OPS_COLORS.revenue.value }}>
                {a.title}
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
              <p className="mt-2 text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                {a.targetType}
                {a.targetRegion ? ` · ${a.targetRegion}` : ""} ·{" "}
                {new Date(a.createdAt).toLocaleString("zh-TW")}
              </p>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
