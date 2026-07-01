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
  newHireLabel?: string | null;
};

type CalDeduction = { label: string; hours: number; note?: string | null };

type CalDay = {
  date: string;
  weekday: number;
  holiday: string | null;
  staff: CalStaff[];
  deductions: CalDeduction[];
  efficiencyRatio: number | null;
  isAchieved: boolean;
  isExceed: boolean;
  hasData: boolean;
  revenue: number;
  rawHours: number;
  netHours: number;
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

  const storeTarget = ctx?.performanceStoreId && targetData
    ? targetData.stores.find((s) => s.storeId === ctx.performanceStoreId)
    : null;

  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-lg font-bold text-slate-800">月曆 &amp; 達標</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => { const p = prevMonth(year, month); goMonth(p.year, p.month); }}
            className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
          >
            <i className="ti ti-chevron-left" aria-hidden="true" />
            上個月
          </button>
          <span className="min-w-24 text-center text-base font-bold text-slate-800">{year}年{month}月</span>
          <button
            type="button"
            onClick={() => { const n = nextMonth(year, month); goMonth(n.year, n.month); }}
            className="flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
          >
            下個月
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

        <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-amber-800 rounded-xl border border-slate-100 bg-amber-50 px-3 py-2">
          <span>達標條件：平日工效比 ≥ 4,000 元/hr、週六 ≥ 5,500 元/hr</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-400" />本店人員
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />調入（他店來支援）
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />調出（去他店支援）
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
             <div style={{ minWidth: 0, maxWidth: "100%" }}>
              <div className="grid grid-cols-7 border-b border-slate-100">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div
                    key={d}
                    className={`py-2 text-center text-sm font-bold ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-600"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-[3px] bg-slate-100 p-[3px]">
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

                  let cellCls = "min-h-28 p-1.5 rounded-sm border ";
                  if (isRest) cellCls += "bg-slate-50/70 border-slate-200 ";
                  else if (isFuture) cellCls += "bg-white opacity-50 border-slate-200 ";
                  else if (day?.isExceed) cellCls += "bg-purple-50 border-purple-300 ";
                  else if (day?.isAchieved) cellCls += "bg-emerald-50 border-emerald-300 ";
                  else if (day?.hasData) cellCls += "bg-white border-red-300 ";
                  else cellCls += "bg-white border-slate-200 ";

                  const borderStyle: React.CSSProperties = isToday
                    ? { outline: "2px solid #93c5fd", outlineOffset: "-2px" }
                    : {};

                  const tag =
                    !isRest && !isFuture && day?.hasData
                      ? (day as any).isExceed
                        ? { label: "超標", cls: "bg-purple-100 text-purple-700" }
                        : day.isAchieved
                        ? { label: "達標", cls: "bg-emerald-100 text-emerald-700" }
                        : { label: "未達", cls: "bg-red-100 text-red-600" }
                      : null;

                  const maxStaff = 8; // updated

                  return (
                    <div key={d} className={cellCls} style={borderStyle}>
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`text-xs font-medium ${
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
                          <span className={`rounded px-1.5 py-px text-[10px] font-medium ${tag.cls}`}>
                            {tag.label}
                          </span>
                        )}
                      </div>
                      {!isRest && !isFuture && day?.hasData && (
                        <div
                          className="mb-1.5 pb-1.5 text-[11px] font-medium"
                          style={{
                            borderBottom: "0.5px solid rgba(0,0,0,0.07)",
                            color: day.isExceed ? "#5b21b6" : day.isAchieved ? "#085041" : "#475569",
                          }}
                        >
                          {day.netHours.toFixed(1)}h &nbsp;／&nbsp; ${day.revenue >= 10000 ? `${(day.revenue / 10000).toFixed(1)}萬` : day.revenue.toLocaleString()}
                        </div>
                      )}
                      {!isRest && !isFuture && (
                        <>
                          {(day?.staff ?? []).slice(0, maxStaff).map((s, si) => (
                            <div key={si} className="flex items-start gap-1 mb-1">
                              <span className={`inline-block mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${s.outgoingTo ? "bg-indigo-500" : s.isSupport ? "bg-amber-400" : "bg-teal-400"}`} />
                              <span className="text-[11px] leading-tight text-slate-700">
                                {s.name}
                                <span className="text-slate-400 ml-0.5">{s.workHours.toFixed(1)}h</span>
                                {s.outgoingTo ? (
                                  <span className="text-indigo-500 ml-0.5">→ {s.outgoingTo}</span>
                                ) : s.isSupport && s.homeStore ? (
                                  <span className="text-amber-600 ml-0.5">（{s.homeStore}）</span>
                                ) : null}
                                {s.newHireLabel && (
                                  <span className="text-orange-500 ml-0.5">（{s.newHireLabel}）</span>
                                )}
                              </span>
                            </div>
                          ))}
                          {(day?.staff.length ?? 0) > maxStaff && (
                            <div className="text-[10px] text-slate-400">
                              +{(day?.staff.length ?? 0) - maxStaff} 人
                            </div>
                          )}
                          {(day?.deductions ?? []).map((ded, di) => (
                            <div key={di} className="text-[10px] font-medium text-red-500">
                              -{ded.hours}h {ded.label}{ded.note ? ` (${ded.note})` : ""}
                            </div>
                          ))}
                          {day?.efficiencyRatio != null && (
                            <div
                              className={`mt-1 text-[11px] font-medium ${
                                day.isExceed
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
            </div>

            {targetData && storeTarget && (() => {
              const totalMet = storeTarget.byWeek.reduce((a, w) => a + w.metDays, 0);
              const totalExceed = storeTarget.byWeek.reduce((a, w) => a + w.exceedDays, 0);
              return (
                <div className="mt-4 rounded-lg border border-slate-100 bg-white p-4">
                  <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
                    <span className="text-sm font-bold text-slate-700">週別達標摘要</span>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        達標 {totalMet} 天
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${totalExceed > 0 ? "bg-purple-50 text-purple-600" : "bg-slate-50 text-slate-300"}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${totalExceed > 0 ? "bg-purple-400" : "bg-slate-200"}`} />
                        超標 {totalExceed} 天
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {targetData.weeks.map((w, i) => {
                      const wk = storeTarget.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
                      const isOngoing = w.endYmd >= todayYmd && w.startYmd <= todayYmd;
                      const notStarted = w.startYmd > todayYmd;
                      return (
                        <div
                          key={w.index}
                          className="flex items-center gap-3"
                          style={{ opacity: notStarted ? 0.4 : 1 }}
                        >
                          <span className="w-28 flex-shrink-0 text-xs text-slate-500">
                            W{w.index} · {fmtMd(w.startYmd)}–{fmtMd(w.endYmd)}
                          </span>
                          <div className="flex gap-2">
                            {notStarted ? (
                              <span className="rounded-full bg-slate-50 px-3 py-0.5 text-xs text-slate-400">尚未開始</span>
                            ) : (
                              <>
                                <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${wk.metDays > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>
                                  達標 {wk.metDays}
                                </span>
                                <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${wk.exceedDays > 0 ? "bg-purple-100 text-purple-600" : "bg-slate-50 text-slate-300"}`}>
                                  超標 {wk.exceedDays}
                                </span>
                                {isOngoing && (
                                  <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs text-blue-500">進行中</span>
                                )}
                              </>
                            )}
                          </div>
                          <span className="ml-auto text-xs text-slate-400">{w.workingDays} 工作日</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
