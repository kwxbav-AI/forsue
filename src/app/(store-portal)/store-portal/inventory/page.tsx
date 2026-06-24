"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";

type StoreContext = {
  storeName: string;
  performanceStoreId: string | null;
};

type InventoryRow = {
  id: string;
  workDate: string;
  branch: string;
  totalArticles: number | null;
  productCount1: number | null;
  commentCount1: number | null;
  productCount2: number | null;
  commentCount2: number | null;
  productCount3: number | null;
  commentCount3: number | null;
  deductedMinutes: number | null;
  filledAt: string;
};

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StoreInventoryPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = toYmd(now);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!ctxRef.current) {
        const ctxUrl = adminStoreId
          ? `/api/store-portal/context?storeId=${encodeURIComponent(adminStoreId)}`
          : "/api/store-portal/context";
        const res = await fetch(ctxUrl);
        if (!res.ok) throw new Error("無法取得門市資訊");
        ctxRef.current = (await res.json()) as StoreContext;
      }
      const { storeName } = ctxRef.current;
      const params = new URLSearchParams({ startDate: monthStart, endDate: today });
      if (storeName) params.set("branch", storeName);
      const res = await fetch(`/api/content-entries?${params.toString()}`);
      if (!res.ok) throw new Error("現貨文填報紀錄載入失敗");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, monthStart, today]);

  useEffect(() => {
    ctxRef.current = null;
    void load();
  }, [adminStoreId]);

  const totalDeduct = rows.reduce((a, r) => a + (r.deductedMinutes ?? 0), 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-sm font-medium text-slate-800">現貨文本月填報</h1>
          <p className="text-xs text-slate-400">{monthStart} – {today}</p>
        </div>
        <Link href="/workhour-adjustments" target="_blank"
          className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50">
          填報 <ExternalLink size={10} />
        </Link>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        {!loading && rows.length > 0 && (
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">本月填報筆數</p>
              <p className="text-lg font-medium text-slate-800">{rows.length} 筆</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">扣工時合計</p>
              <p className="text-lg font-medium text-red-600">
                -{(totalDeduct / 60).toFixed(2)}h
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">篇數合計</p>
              <p className="text-lg font-medium text-slate-800">
                {rows.reduce((a, r) => a + (r.totalArticles ?? 0), 0)} 篇
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">本月無現貨文填報紀錄</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["日期", "總篇數", "第1篇(商品/留言)", "第2篇(商品/留言)", "第3篇(商品/留言)", "扣工時", "填報時間"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{r.workDate}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{r.totalArticles ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.productCount1 != null ? `${r.productCount1}商/${r.commentCount1 ?? 0}留` : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.productCount2 != null ? `${r.productCount2}商/${r.commentCount2 ?? 0}留` : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.productCount3 != null ? `${r.productCount3}商/${r.commentCount3 ?? 0}留` : "—"}
                    </td>
                    <td className="px-3 py-2 font-medium text-red-600">
                      {r.deductedMinutes != null ? `-${(r.deductedMinutes / 60).toFixed(2)}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-400">{r.filledAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
