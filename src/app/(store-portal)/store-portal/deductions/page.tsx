"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";

type StoreContext = {
  storeName: string;
  performanceStoreId: string | null;
};

type DeductionRow = {
  id: string;
  workDate: string;
  storeId: string;
  storeName: string;
  reason: string;
  hours: number;
  note: string | null;
  filledAt: string;
};

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function StoreDeductionsPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<DeductionRow[]>([]);
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
      const { performanceStoreId } = ctxRef.current;
      const params = new URLSearchParams({ startDate: monthStart, endDate: today });
      if (performanceStoreId) params.set("storeId", performanceStoreId);
      const res = await fetch(`/api/store-hour-deductions?${params.toString()}`);
      if (!res.ok) throw new Error("效期/清掃紀錄載入失敗");
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

  const totalHours = rows.reduce((a, r) => a + r.hours, 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-sm font-medium text-slate-800">效期 / 清掃本月填報</h1>
          <p className="text-xs text-slate-400">{monthStart} – {today}</p>
        </div>
        <Link href="/store-hour-deductions" target="_blank"
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
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">本月填報筆數</p>
              <p className="text-lg font-medium text-slate-800">{rows.length} 筆</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-[10px] text-slate-400">本月扣工時合計</p>
              <p className="text-lg font-medium text-red-600">-{totalHours.toFixed(2)}h</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">本月無填報紀錄</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["日期", "原因", "扣工時", "備註", "填報時間"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{r.workDate}</td>
                    <td className="px-3 py-2 text-slate-700">{r.reason}</td>
                    <td className="px-3 py-2 font-medium text-red-600">-{r.hours.toFixed(2)}h</td>
                    <td className="px-3 py-2 text-slate-400">{r.note ?? "—"}</td>
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
