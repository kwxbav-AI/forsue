"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
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

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateWithWeekday(raw: string): string {
  const ymd = raw.length > 10 ? raw.slice(0, 10) : raw;
  const d = new Date(ymd + "T00:00:00Z");
  return `${ymd}（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function StoreInventoryPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;
  const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const monthStart = `${monthStr}-01`;
  const endDate = isCurrentMonth ? toYmd(now) : lastDayOfMonth(selectedYear, selectedMonth);

  function prevMonth() {
    if (selectedMonth === 1) { setSelectedYear((y) => y - 1); setSelectedMonth(12); }
    else setSelectedMonth((m) => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (selectedMonth === 12) { setSelectedYear((y) => y + 1); setSelectedMonth(1); }
    else setSelectedMonth((m) => m + 1);
  }

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
      const params = new URLSearchParams({ startDate: monthStart, endDate });
      if (storeName) params.set("branch", storeName);
      const res = await fetch(`/api/content-entries?${params.toString()}`);
      if (!res.ok) throw new Error("現貨文填報紀錄載入失敗");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, monthStart, endDate]);

  useEffect(() => { ctxRef.current = null; }, [adminStoreId]);
  useEffect(() => { void load(); }, [load]);

  const totalDeduct = rows.reduce((a, r) => a + (r.deductedMinutes ?? 0), 0);
  const totalArticles = rows.reduce((a, r) => a + (r.totalArticles ?? 0), 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">現貨文填報</h1>
          <p className="text-xs text-slate-400">
            {isCurrentMonth ? `截至 ${endDate}` : `${monthStart} – ${endDate}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/workhour-adjustments" target="_blank"
            className="flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50">
            填報 <ExternalLink size={10} />
          </Link>
          <button type="button" onClick={prevMonth}
            className="flex items-center gap-0.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
            <ChevronLeft size={12} />上個月
          </button>
          <span className="min-w-[72px] text-center text-xs font-medium text-slate-700">
            {selectedYear}年{selectedMonth}月
          </span>
          <button type="button" onClick={nextMonth} disabled={isCurrentMonth}
            className="flex items-center gap-0.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30">
            下個月<ChevronRight size={12} />
          </button>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <div className="mb-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        {!loading && rows.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-3">
            {/* 填報筆數 — 藍 */}
            <div className="rounded-xl p-4" style={{ background: "#E6F1FB" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#185FA5" }}>本月填報筆數</p>
              <p className="text-2xl font-medium" style={{ color: "#0C447C" }}>
                {rows.length}
                <span className="ml-1 text-sm font-normal" style={{ color: "#185FA5" }}>筆</span>
              </p>
            </div>
            {/* 扣工時 — 紅 */}
            <div className="rounded-xl p-4" style={{ background: "#FCEBEB" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#A32D2D" }}>扣工時合計</p>
              <p className="text-2xl font-medium" style={{ color: "#791F1F" }}>
                -{(totalDeduct / 60).toFixed(2)}
                <span className="ml-1 text-sm font-normal" style={{ color: "#A32D2D" }}>h</span>
              </p>
            </div>
            {/* 篇數 — 橘 */}
            <div className="rounded-xl p-4" style={{ background: "#FAEEDA" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#854F0B" }}>篇數合計</p>
              <p className="text-2xl font-medium" style={{ color: "#633806" }}>
                {totalArticles}
                <span className="ml-1 text-sm font-normal" style={{ color: "#854F0B" }}>篇</span>
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">本月無現貨文填報紀錄</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["日期", "總篇數", "第1篇（商品/留言）", "第2篇（商品/留言）", "第3篇（商品/留言）", "扣工時", "填報時間"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sm font-bold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-3 py-2 text-sm text-slate-500 whitespace-nowrap">{fmtDateWithWeekday(r.workDate)}</td>
                    <td className="px-3 py-2 text-sm text-center font-medium text-slate-700">{r.totalArticles ?? "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {r.productCount1 != null ? `${r.productCount1} 商 / ${r.commentCount1 ?? 0} 留` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {r.productCount2 != null ? `${r.productCount2} 商 / ${r.commentCount2 ?? 0} 留` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-600">
                      {r.productCount3 != null ? `${r.productCount3} 商 / ${r.commentCount3 ?? 0} 留` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-red-600 whitespace-nowrap">
                      {r.deductedMinutes != null ? `-${(r.deductedMinutes / 60).toFixed(2)}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-400 whitespace-nowrap">{r.filledAt}</td>
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
