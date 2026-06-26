"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type StoreContext = {
  storeName: string;
  performanceStoreId: string | null;
};

type DispatchRow = {
  id: string;
  workDate: string;
  employeeCode: string;
  employeeName: string;
  fromStoreName: string | null;
  toStoreName: string | null;
  dispatchHours: number | null;
  actualHours: number | null;
  confirmStatus: string | null;
};

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function toYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateWithWeekday(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  return `${ymd}（${WEEKDAY_ZH[d.getUTCDay()]}）`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function StatusBadge({ s }: { s: string | null }) {
  if (!s) return <span className="text-slate-300">—</span>;
  const cls =
    s === "已確認" ? "bg-emerald-50 text-emerald-700"
    : s === "未確認" ? "bg-amber-50 text-amber-700"
    : "bg-slate-100 text-slate-500";
  return <span className={`rounded px-1.5 py-px text-[10px] font-medium ${cls}`}>{s}</span>;
}

function DirectionBadge({ direction }: { direction: "調入" | "調出" }) {
  return direction === "調入"
    ? <span className="rounded px-2 py-px text-[10px] font-medium bg-emerald-50 text-emerald-700">調入</span>
    : <span className="rounded px-2 py-px text-[10px] font-medium bg-amber-50 text-amber-700">調出</span>;
}

export default function StoreDispatchPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const ctxRef = useRef<StoreContext | null>(null);
  const [rows, setRows] = useState<DispatchRow[]>([]);
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
      const res = await fetch(`/api/dispatches?${params.toString()}`);
      if (!res.ok) throw new Error("調度紀錄載入失敗");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, monthStart, endDate]);

  useEffect(() => { ctxRef.current = null; }, [adminStoreId]);
  useEffect(() => { void load(); }, [load]);

  const storeName = ctxRef.current?.storeName ?? "";
  const dispatchIn = rows.filter((r) => r.toStoreName === storeName || (!r.fromStoreName && r.toStoreName));
  const dispatchOut = rows.filter((r) => r.fromStoreName === storeName);

  function getDirection(r: DispatchRow): "調入" | "調出" {
    return r.fromStoreName === storeName ? "調出" : "調入";
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">調度紀錄</h1>
          <p className="text-xs text-slate-400">
            {isCurrentMonth ? `截至 ${endDate}` : `${monthStart} – ${endDate}`}（含調入 &amp; 調出）
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/dispatches" target="_blank"
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
            <div className="rounded-xl p-4" style={{ background: "#E1F5EE" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#0F6E56" }}>本月調入</p>
              <p className="text-2xl font-medium" style={{ color: "#085041" }}>
                {dispatchIn.length}
                <span className="ml-1 text-sm font-normal" style={{ color: "#0F6E56" }}>筆</span>
              </p>
              <p className="mt-1 text-[11px]" style={{ color: "#0F6E56" }}>他店人員來本店支援</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "#FAEEDA" }}>
              <p className="mb-1 text-xs font-medium" style={{ color: "#854F0B" }}>本月調出</p>
              <p className="text-2xl font-medium" style={{ color: "#633806" }}>
                {dispatchOut.length}
                <span className="ml-1 text-sm font-normal" style={{ color: "#854F0B" }}>筆</span>
              </p>
              <p className="mt-1 text-[11px]" style={{ color: "#854F0B" }}>本店人員去他店支援</p>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">本月無調度紀錄</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-400">共 {rows.length} 筆</p>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    {["方向", "日期", "員工", "來源門市", "調至門市", "排定", "實際", "狀態"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-medium text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 last:border-0">
                      <td className="px-3 py-2"><DirectionBadge direction={getDirection(r)} /></td>
                      <td className="px-3 py-2 text-slate-500">{fmtDateWithWeekday(r.workDate)}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{r.employeeName}</td>
                      <td className="px-3 py-2 text-slate-500">{r.fromStoreName ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{r.toStoreName ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.dispatchHours != null ? `${r.dispatchHours}h` : "—"}</td>
                      <td className="px-3 py-2 font-medium text-slate-700">{r.actualHours != null ? `${r.actualHours}h` : "—"}</td>
                      <td className="px-3 py-2"><StatusBadge s={r.confirmStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
