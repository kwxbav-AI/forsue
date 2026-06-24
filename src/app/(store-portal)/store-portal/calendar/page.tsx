"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type StoreContext = {
  performanceStoreId: string | null;
  storeName: string;
};

type CalStaff = {
  name: string;
  workHours: number;
  homeStore: string | null;
  isSupport: boolean;
  outgoingTo: string | null;
};

type CalDay = {
  date: string;
  weekday: number;
  holiday: string | null;
  staff: CalStaff[];
  efficiencyRatio: number | null;
  isAchieved: boolean;
  hasData: boolean;
};

type CalData = {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  days: CalDay[];
};

type TargetWeek = { index: number; startYmd: string; endYmd: string; workingDays: number };
type TargetRow = { storeId: string; byWeek: { metDays: number; exceedDays: number; total: number }[] };
type TargetData = { weeks: TargetWeek[]; stores: TargetRow[] };

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function toMonthStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function fmtMd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export default function StoreCalendarPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [ctx, setCtx] = useState<StoreContext | null>(null);
  const [calData, setCalData] = useState<CalData | null>(null);
  const [targetData, setTargetData] = useState<TargetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retailStoreId, setRetailStoreId] = useState<string | null>(null);

  const load = useCallback(
    async (y: number, m: number) => {
      setLoading(true);
      setError(null);
      try {
        let storeCtx = ctx;
        let rsId = retailStoreId;
        if (!storeCtx) {
          const ctxUrl = adminStoreId
            ? `/api/store-portal/context?storeId=${encodeURIComponent(adminStoreId)}`
            : "/api/store-portal/context";
          const res = await fetch(ctxUrl);
          if (!res.ok) throw new Error("無法取得門市資訊");
          const data = await res.json();
          storeCtx = data as StoreContext;
          rsId = (data as { retailStoreId: string }).retailStoreId;
          setCtx(storeCtx);
          setRetailStoreId(rsId);
        }
        if (!storeCtx.performanceStoreId) throw new Error("找不到對應績效門市");

        const monthStr = toMonthStr(y, m);
        const [calRes, targetRes] = await Promise.all([
          fetch(
            `/api/operations/work-hours/calendar?storeId=${encodeURIComponent(storeCtx.performanceStoreId)}&year=${y}&month=${m}`
          ),
          fetch(`/api/reports/store-target-card?month=${encodeURIComponent(monthStr)}`),
        ]);
        if (!calRes.ok) throw new Error("月曆載入失敗");
        setCalData(await calRes.json());
        if (targetRes.ok) setTargetData(await targetRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    },
    [ctx, retailStoreId]
  );

  useEffect(() => {
    void load(year, month);
  }, [year, month]);

  function goMonth(y: number, m: number) {
    setYear(y);
    setMonth(m);
    void load(y, m);
  }

  const dayMap = new Map<string, CalDay>();
  calData?.days.forEach((d) => dayMap.set(d.date, d));

  const firstWeekday = calData ? new Date(calData.startDate + "T00:00:00Z").getUTCDay() : 0;
  const daysInMonth = calData?.days.length ?? 0;
  const blanks = Array(firstWeekday).fill(null);
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const storeTarget = retailStoreId && targetData
    ? targetData.stores.find((s) => s.storeId === retailStoreId)
    : null;

  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-sm font-medium text-slate-800">月曆 &amp; 達標</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => { const p = prevMonth(year, month); goMonth(p.year, p.month); }}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            <i className="ti ti-chevron-left" aria-hidden="true" />
          </button>
          <span className="min-w-20 text-center text-sm font-medium">{year}年{month}月</span>
          <button
            type="button"
            onClick={() => { const n = nextMonth(year, month); goMonth(n.year, n.month); }}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            <i className="ti ti-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-3 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mb-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />達標
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-400" />超標
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />未達
          </span>
          <span className="ml-auto text-[9px] text-slate-400">藍色文字 = 跨店支援</span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="grid grid-cols-7 border-b border-slate-100">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className={`py-1.5 text-center text-[10px] font-medium ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                {blanks.map((_, i) => (
                  <div key={`b${i}`} className="min-h-24 bg-slate-50/50" />
                ))}
                {dayNumbers.map((d) => {
                  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const day = dayMap.get(ymd);
                  const isSun = (blanks.length + d - 1) % 7 === 0;
                  const isSat = (blanks.length + d - 1) % 7 === 6;
                  const isToday = ymd === todayYmd;
                  const isFuture = ymd > todayYmd;
                  const isHoliday = !!day?.holiday;
                  const isRest = isSun || isHoliday;

                  let cellCls = "min-h-24 p-1.5 ";
                  if (isRest) cellCls += "bg-slate-50/70 ";
                  else if (isFuture) cellCls += "bg-white opacity-50 ";
                  else if (day?.efficiencyRatio != null && day.efficiencyRatio >= 6000) cellCls += "bg-purple-50 ";
                  else if (day?.isAchieved) cellCls += "bg-emerald-50 ";
                  else if (day?.hasData) cellCls += "bg-white ";
                  else cellCls += "bg-white ";

                  if (isToday) cellCls += "ring-1 ring-inset ring-blue-300 ";

                  const tag =
                    !isRest && !isFuture && day?.hasData
                      ? day.efficiencyRatio != null && day.efficiencyRatio >= 6000
                        ? { label: "超標", cls: "bg-purple-100 text-purple-700" }
                        : day.isAchieved
                        ? { label: "達標", cls: "bg-emerald-100 text-emerald-700" }
                        : { label: "未達", cls: "bg-slate-100 text-slate-500" }
                      : null;

                  const maxStaff = 5;

                  return (
                    <div key={d} className={cellCls}>
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`text-[10px] font-medium ${
                            isSun || isHoliday
                              ? "text-red-400"
                              : isSat
                              ? "text-blue-400"
                              : isToday
                              ? "text-blue-600"
                              : "text-slate-500"
                          }`}
                        >
                          {d}
                        </span>
                        {tag && (
                          <span className={`rounded px-1 py-px text-[8px] font-medium ${tag.cls}`}>
                            {tag.label}
                          </span>
                        )}
                      </div>
                      {!isRest && !isFuture && (
                        <>
                          {(day?.staff ?? []).slice(0, maxStaff).map((s, si) => (
                            <div key={si} className="flex items-center gap-0.5 leading-tight">
                              <span
                                className={`truncate text-[9px] ${s.isSupport || s.outgoingTo ? "text-blue-500" : "text-slate-500"}`}
                                style={{ maxWidth: 38 }}
                              >
                                {s.name}
                              </span>
                              <span className="text-[9px] font-medium text-slate-700">
                                {s.workHours.toFixed(2)}h
                              </span>
                              {(s.homeStore || s.outgoingTo) && (
                                <span className="text-[8px] text-blue-400">
                                  ({s.homeStore ?? s.outgoingTo})
                                </span>
                              )}
                            </div>
                          ))}
                          {(day?.staff.length ?? 0) > maxStaff && (
                            <div className="text-[8px] text-slate-400">
                              +{(day?.staff.length ?? 0) - maxStaff} 人
                            </div>
                          )}
                          {day?.efficiencyRatio != null && (
                            <div
                              className={`mt-0.5 text-[8px] ${
                                day.efficiencyRatio >= 6000
                                  ? "text-purple-600"
                                  : day.isAchieved
                                  ? "text-emerald-600"
                                  : "text-slate-400"
                              }`}
                            >
                              工效 {Math.round(day.efficiencyRatio).toLocaleString()}
                            </div>
                          )}
                        </>
                      )}
                      {isHoliday && (
                        <div className="text-[8px] text-red-400">{day?.holiday}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {targetData && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium text-slate-500">週別達標摘要</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${targetData.weeks.length}, 1fr)` }}>
                  {targetData.weeks.map((w, i) => {
                    const wk = storeTarget?.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
                    const isOngoing = w.endYmd >= todayYmd && w.startYmd <= todayYmd;
                    const notStarted = w.startYmd > todayYmd;
                    return (
                      <div
                        key={w.index}
                        className={`rounded-lg border p-2.5 ${wk.total > 0 ? "border-emerald-100 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}
                      >
                        <div className="mb-1.5 text-[9px] text-slate-400">
                          W{w.index} · {fmtMd(w.startYmd)}–{fmtMd(w.endYmd)}
                        </div>
                        {notStarted ? (
                          <div className="text-[10px] text-slate-400">尚未開始</div>
                        ) : isOngoing ? (
                          <>
                            <div className="text-sm font-medium text-emerald-700">達標 {wk.metDays}</div>
                            {wk.exceedDays > 0 && <div className="text-xs font-medium text-purple-600">超標 {wk.exceedDays}</div>}
                            <div className="text-[9px] text-slate-400">進行中</div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-medium text-emerald-700">達標 {wk.metDays}</div>
                            {wk.exceedDays > 0 && <div className="text-xs font-medium text-purple-600">超標 {wk.exceedDays}</div>}
                            <div className="text-[9px] text-slate-400">{w.workingDays} 工作日</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
