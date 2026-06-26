"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
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

const REASON_LABEL: Record<string, string> = {
  EXPIRY: "效期處理",
  CLEANING: "清掃",
  INVENTORY_REGISTRATION: "庫存登記",
  OTHER: "其他",
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

export default function StoreDeductionsPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<DeductionRow[]>([]);
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
      const { performanceStoreId } = ctxRef.current;
      const params = new URLSearchParams({ startDate: monthStart, endDate });
      if (performanceStoreId) params.set("storeId", performanceStoreId);
      const res = await fetch(`/api/store-hour-deductions?${params.toString()}`);
      if (!res.ok) throw new Error("效期/清掃紀錄載入失敗");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, monthStart, endDate]);

  useEffect(() => { ctxRef.current = null; }, [adminStoreId]);
  useEffect(() => { void load(); }, [load]);

  const totalHours = rows.reduce((a, r) => a + r.hours, 0);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">效期 / 清掃填報</h1>
          <p className="text-xs text-slate-400">
            {isCurrentMonth ? `截至 ${endDate}` : `${monthStart} – ${endDate}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/store-hour-deductions" target="_blank"
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
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl p-4" style={{ background: "#E6F1FB" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#185FA5" }}>本月填報筆數</p>
              <p className="text-2xl font-medium" style={{ color: "#0C447C" }}>
                {rows.length}
                <span className="ml-1 text-sm font-normal" style={{ color: "#185FA5" }}>筆</span>
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "#FCEBEB" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#A32D2D" }}>本月扣工時合計</p>
              <p className="text-2xl font-medium" style={{ color: "#791F1F" }}>
                -{totalHours.toFixed(2)}
                <span className="ml-1 text-sm font-normal" style={{ color: "#A32D2D" }}>h</span>
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">本月無填報紀錄</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["日期", "原因", "扣工時", "備註", "填報時間"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-sm font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                    <td className="px-3 py-2 text-sm text-slate-500">{fmtDateWithWeekday(r.workDate)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{REASON_LABEL[r.reason] ?? r.reason}</td>
                    <td className="px-3 py-2 text-sm font-medium text-red-600">-{r.hours.toFixed(2)}h</td>
                    <td className="px-3 py-2 text-sm text-slate-400">{r.note ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-400">{r.filledAt}</td>
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
