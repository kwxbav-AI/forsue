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
  temporaryLabel?: string | null;
};

type CalDeduction = { label: string; hours: number; note?: string | null; isPositive?: boolean };

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

type WeekSummary = {
  index: number;
  startYmd: string;
  endYmd: string;
  workingDays: number;
  metDays: number;
  exceedDays: number;
};

/** 與 server-side buildWeeksForMonth 相同邏輯：週日斷開，月份所有日期切成週段 */
function buildWeeklySummary(year: number, month: number, dayMap: Map<string, CalDay>): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  let batch: string[] = [];

  function flushWeek() {
    if (batch.length === 0) return;
    const startYmd = batch[0];
    const endYmd = batch[batch.length - 1];
    let workingDays = 0, metDays = 0, exceedDays = 0;
    for (const ymd of batch) {
      const d = dayMap.get(ymd);
      if (!d?.holiday) workingDays++;
      if (d?.isExceed) exceedDays++;
      else if (d?.isAchieved) metDays++;
    }
    weeks.push({ index: weeks.length + 1, startYmd, endYmd, workingDays, metDays, exceedDays });
    batch = [];
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= lastDay; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dow = d.getUTCDay();
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (dow === 0) { flushWeek(); continue; }
    batch.push(ymd);
  }
  flushWeek();
  return weeks;
}

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
  const [calData, setCalData] = useState<CalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (y: number, m: number) => {
      setLoading(true);
      setError(null);
      try {
        const ctxUrl = adminStoreId
          ? `/api/store-portal/context?storeId=${encodeURIComponent(adminStoreId)}`
          : "/api/store-portal/context";
        const res = await fetch(ctxUrl);
        if (!res.ok) throw new Error("無法取得門市資訊");
        const storeCtx = (await res.json()) as StoreContext;
        if (!storeCtx.performanceStoreId) throw new Error("找不到對應績效門市");

        const calRes = await fetch(
          `/api/operations/work-hours/calendar?storeId=${encodeURIComponent(storeCtx.performanceStoreId)}&year=${y}&month=${m}`
        );
        if (!calRes.ok) throw new Error("月曆載入失敗");
        setCalData(await calRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        setLoading(false);
      }
    },
    [adminStoreId]
  );

  useEffect(() => {
    void load(year, month);
  }, [year, month, load]);

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

  const weeklySummary = calData ? buildWeeklySummary(year, month, dayMap) : [];

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
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-1.5">
              {/* 星期標題列 */}
              <div
                className="grid mb-1.5"
                style={{ gridTemplateColumns: "0.5fr 1fr 1fr 1fr 1fr 1fr 1fr" }}
              >
                {WEEKDAY_LABELS.map((lbl, i) => (
                  <div
                    key={lbl}
                    className={`py-1.5 text-center text-[11px] font-medium tracking-wide uppercase ${
                      i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400"
                    }`}
                  >
                    {lbl}
                  </div>
                ))}
              </div>

              {/* 日期格子 */}
              <div
                className="grid gap-[5px]"
                style={{ gridTemplateColumns: "0.5fr 1fr 1fr 1fr 1fr 1fr 1fr" }}
              >
                {/* 月初空白格 */}
                {blanks.map((_, i) => {
                  const isSunBlank = i % 7 === 0;
                  return isSunBlank ? (
                    <div key={`b${i}`} className="rounded-[10px] border border-slate-100 bg-white/40 min-h-[136px]" />
                  ) : (
                    <div key={`b${i}`} className="rounded-[10px] border border-slate-100 bg-white/40 min-h-[136px]" />
                  );
                })}

                {dayNumbers.map((d) => {
                  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  const day = dayMap.get(ymd);
                  const isSun = (blanks.length + d - 1) % 7 === 0;
                  const isSat = (blanks.length + d - 1) % 7 === 6;
                  const isToday = ymd === todayYmd;
                  const isFuture = ymd > todayYmd;
                  const isHoliday = !!day?.holiday;
                  const maxStaff = 8;

                  /* ── 週日格：僅顯示日期＋假日文字 ── */
                  if (isSun) {
                    return (
                      <div
                        key={d}
                        className="rounded-[10px] border border-slate-100 bg-white/60 min-h-[136px] flex flex-col items-center justify-start pt-3 gap-1"
                        style={isToday ? { outline: "2px solid #93c5fd", outlineOffset: "-2px" } : {}}
                      >
                        <span className="text-[15px] font-medium text-red-400">{d}</span>
                        {isHoliday && (
                          <span className="text-[10px] font-medium text-red-300 text-center px-1 leading-tight">{day?.holiday}</span>
                        )}
                      </div>
                    );
                  }

                  /* ── 一～六格：完整卡片 ── */
                  let cellBorder = "border-slate-200";
                  let cellBg = "bg-white";
                  let statusDotCls = "";

                  if (isHoliday) {
                    cellBorder = "border-slate-200";
                    cellBg = "bg-slate-50";
                  } else if (isFuture) {
                    cellBorder = "border-slate-100";
                    cellBg = "bg-white opacity-50";
                  } else if (day?.isExceed) {
                    cellBorder = "border-purple-200";
                    cellBg = "bg-purple-50";
                    statusDotCls = "bg-purple-400";
                  } else if (day?.isAchieved) {
                    cellBorder = "border-emerald-200";
                    cellBg = "bg-emerald-50";
                    statusDotCls = "bg-emerald-400";
                  } else if (day?.hasData) {
                    cellBorder = "border-red-200";
                    cellBg = "bg-red-50";
                    statusDotCls = "bg-red-400";
                  }

                  const summaryColor =
                    day?.isExceed ? "text-purple-700"
                    : day?.isAchieved ? "text-emerald-800"
                    : day?.hasData ? "text-slate-700"
                    : "text-slate-700";

                  const effColor =
                    day?.isExceed ? "text-purple-500"
                    : day?.isAchieved ? "text-emerald-600"
                    : "text-slate-400";

                  return (
                    <div
                      key={d}
                      className={`rounded-[10px] border ${cellBorder} ${cellBg} min-h-[136px] p-[10px]`}
                      style={isToday ? { outline: "2px solid #93c5fd", outlineOffset: "-2px" } : {}}
                    >
                      {/* 日期 + 狀態點 */}
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span
                          className={`text-[17px] font-medium leading-none ${
                            isHoliday ? "text-red-400"
                            : isSat ? "text-blue-500"
                            : isToday ? "text-blue-600"
                            : "text-slate-700"
                          }`}
                        >
                          {d}
                        </span>
                        {statusDotCls && (
                          <span className={`inline-block h-2 w-2 rounded-full ${statusDotCls}`} />
                        )}
                      </div>

                      {/* 假日文字 */}
                      {isHoliday && (
                        <div className="text-[14px] font-medium text-red-400 mb-1">{day?.holiday}</div>
                      )}

                      {/* 工時 + 營收摘要 */}
                      {!isHoliday && !isFuture && day?.hasData && (
                        <>
                          <div className={`text-[13px] font-medium mb-0.5 ${summaryColor}`}>
                            {day.netHours.toFixed(1)}h · ${day.revenue >= 10000 ? `${(day.revenue / 10000).toFixed(1)}萬` : day.revenue.toLocaleString()}
                          </div>
                          <div className={`text-[11px] mb-2 ${effColor}`}>
                            工效比 {day.efficiencyRatio != null ? `${Math.round(day.efficiencyRatio).toLocaleString()} 元/hr` : "—"}
                          </div>
                        </>
                      )}

                      {/* 員工列表 */}
                      {!isHoliday && !isFuture && (
                        <>
                          {(day?.staff ?? []).slice(0, maxStaff).map((s, si) => (
                            <div key={si} className="flex items-center gap-1.5 mb-1">
                              <span
                                className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                                  s.outgoingTo ? "bg-indigo-400" : s.isSupport ? "bg-amber-400" : "bg-teal-400"
                                }`}
                              />
                              <span className="text-[12px] text-slate-600 truncate">{s.name}</span>
                              <span className="text-[12px] font-medium text-slate-700 ml-auto flex-shrink-0">
                                {s.workHours.toFixed(1)}h
                              </span>
                            </div>
                          ))}
                          {/* 調入/調出備註 */}
                          {(day?.staff ?? []).slice(0, maxStaff).map((s, si) => (
                            s.outgoingTo ? (
                              <div key={`note-${si}`} className="text-[10px] text-indigo-400 mb-0.5">
                                {s.name} → {s.outgoingTo}
                              </div>
                            ) : s.isSupport && s.homeStore ? (
                              <div key={`note-${si}`} className="text-[10px] text-amber-500 mb-0.5">
                                {s.name}（{s.homeStore}）
                              </div>
                            ) : null
                          ))}
                          {(day?.staff.length ?? 0) > maxStaff && (
                            <div className="text-[10px] text-slate-400">+{(day?.staff.length ?? 0) - maxStaff} 人</div>
                          )}
                          {(day?.deductions ?? []).map((ded, di) => (
                            <div key={di} className={`text-[11px] font-medium ${ded.isPositive ? "text-green-600" : "text-red-500"}`}>
                              {ded.isPositive ? "+" : "-"}{ded.hours}h {ded.label}{ded.note ? `（${ded.note}）` : ""}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {weeklySummary.length > 0 && (() => {
              const totalMet = weeklySummary.reduce((a, w) => a + w.metDays, 0);
              const totalExceed = weeklySummary.reduce((a, w) => a + w.exceedDays, 0);
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
                    {weeklySummary.map((w) => {
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
                                <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${w.metDays > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>
                                  達標 {w.metDays}
                                </span>
                                <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${w.exceedDays > 0 ? "bg-purple-100 text-purple-600" : "bg-slate-50 text-slate-300"}`}>
                                  超標 {w.exceedDays}
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
