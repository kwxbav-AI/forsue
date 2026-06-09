"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import type { ShiftPlanMonthResponse } from "@/modules/supervisor/types/shift-plan-calendar";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function fmtMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export default function SupervisorShiftCalendarPage() {
  const init = currentYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [storeId, setStoreId] = useState("");
  const [region, setRegion] = useState("");
  const [data, setData] = useState<ShiftPlanMonthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthKey = fmtMonth(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthKey });
      if (storeId) params.set("storeId", storeId);
      if (region) params.set("region", region);
      const res = await fetch(`/api/operations/shift-plans/month?${params}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [monthKey, region, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const regionOptions = useMemo(() => {
    const opsRegions = DUAL_OPS_REGIONS as readonly string[];
    const set = new Set<string>();
    for (const s of data?.meta.stores ?? []) {
      if (opsRegions.includes(s.region)) set.add(s.region);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [data?.meta.stores]);

  const selectedDay = useMemo(
    () => data?.calendarDays.find((d) => d.date === selectedDate) ?? null,
    [data?.calendarDays, selectedDate]
  );

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">人員排班月曆</h1>
          <p className="text-sm text-slate-500 mt-1">
            資料來源：資料上傳中心「門市排班表」· {data ? `${data.startDate} ~ ${data.endDate}` : monthKey}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            min={2020}
            max={2100}
          />
          <span className="text-sm text-slate-500">年</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="min-w-[120px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部區域</option>
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部門市</option>
            {(data?.meta.stores ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </button>
          <Link
            href="/operations/supervision"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          >
            返回督導管理
          </Link>
        </div>
      </div>

      {data ?
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">排班筆數</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.totalShifts}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">排班總時數</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.totalHours.toFixed(1)}h</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">有資料天數</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.summary.daysWithData}</p>
          </div>
        </div>
      : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800">月曆總覽</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            點選日期查看當日排班明細 · 藍色越深表示當日排班時數越多
          </p>
        </div>

        <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 mb-2">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {(data?.calendarDays ?? []).map((d) => {
            const selected = selectedDate === d.date;
            const intensity =
              d.totalHours >= 40 ? "bg-sky-200 border-sky-400"
              : d.totalHours >= 24 ? "bg-sky-100 border-sky-300"
              : d.totalHours > 0 ? "bg-sky-50 border-sky-200"
              : "bg-white border-slate-200";
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  if (!d.inMonth) return;
                  setSelectedDate((cur) => (cur === d.date ? null : d.date));
                }}
                className={[
                  "min-h-[72px] rounded-lg border px-2 py-1.5 text-left transition-colors",
                  d.inMonth ? intensity : "bg-slate-50 border-slate-200 text-slate-400",
                  selected ? "ring-2 ring-blue-600" : "",
                ].join(" ")}
              >
                <div className="text-sm font-semibold text-slate-800">{d.day}</div>
                {d.inMonth && d.staffCount > 0 ?
                  <>
                    <div className="mt-1 text-[11px] text-slate-600">{d.staffCount} 人</div>
                    <div className="text-[11px] text-slate-500">{d.totalHours.toFixed(1)}h</div>
                  </>
                : d.inMonth ?
                  <div className="mt-1 text-[11px] text-slate-400">無排班</div>
                : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ?
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">
            {selectedDay.date} 排班明細
          </h2>
          {selectedDay.shifts.length ?
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 pr-3">門市</th>
                    <th className="py-2 pr-3">員工</th>
                    <th className="py-2 pr-3">班別</th>
                    <th className="py-2 pr-3">時段</th>
                    <th className="py-2 text-right">時數</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDay.shifts.map((s, i) => (
                    <tr key={`${s.storeId}-${s.employeeCode}-${i}`} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{s.storeName}</td>
                      <td className="py-2 pr-3">
                        {s.employeeCode}
                        {s.employeeName ? ` ${s.employeeName}` : ""}
                      </td>
                      <td className="py-2 pr-3">{s.shiftKind}</td>
                      <td className="py-2 pr-3">
                        {s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{s.scheduledHours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <p className="mt-3 text-sm text-slate-500">此日尚無排班資料，請至資料上傳中心上傳門市排班表。</p>}
        </div>
      : null}

      {!data && !loading ?
        <p className="text-sm text-slate-500">尚無排班資料。</p>
      : null}
    </div>
  );
}
