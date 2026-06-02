"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type {
  SupportLayer,
  SupportRequestsMonthResponse,
  SupportSeverity,
} from "@/modules/supervisor/types/support-requests";

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function fmtMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function badgeClassBySeverity(s: SupportSeverity): string {
  if (s === "covered") return "bg-emerald-100 text-emerald-800";
  if (s === "partial") return "bg-amber-100 text-amber-800";
  if (s === "none") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-600";
}

function cellBgBySeverity(s: SupportSeverity): string {
  if (s === "covered") return "bg-emerald-50 border-emerald-200";
  if (s === "partial") return "bg-amber-50 border-amber-200";
  if (s === "none") return "bg-rose-50 border-rose-200";
  return "bg-white border-slate-200";
}

function severityLabel(s: SupportSeverity): string {
  if (s === "covered") return "已補齊";
  if (s === "partial") return "部分補齊";
  if (s === "none") return "仍缺人";
  return "無";
}

function SummaryCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 border-emerald-100"
      : tone === "warning"
        ? "bg-amber-50 border-amber-100"
        : tone === "danger"
          ? "bg-rose-50 border-rose-100"
          : tone === "info"
            ? "bg-sky-50 border-sky-100"
            : "bg-white border-slate-200";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export default function SupervisorSupportCalendarPage() {
  const init = currentYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [storeId, setStoreId] = useState("");
  const [region, setRegion] = useState<string>("");
  const [layer, setLayer] = useState<SupportLayer>("actual");

  const [data, setData] = useState<SupportRequestsMonthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [openStoreIds, setOpenStoreIds] = useState<Set<string>>(() => new Set());

  const monthKey = fmtMonth(year, month);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthKey, store: storeId || "all" });
      if (region) params.set("region", region);
      const res = await fetch(`/api/support-requests?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as SupportRequestsMonthResponse;
        setData(json);
        setLayer(json.meta?.layerDefault ?? "actual");
        // 初始化展開狀態：當日全部展開、第二層預設展開（這裡用 store 展開代表）
        const ids = new Set<string>();
        for (const d of json.dates) {
          for (const s of d.stores) ids.add(s.storeId);
        }
        setOpenStoreIds(ids);
        // 若選取日期不在新資料中，則取消
        if (selectedDate && !json.dates.some((d) => d.date === selectedDate)) {
          setSelectedDate(null);
        }
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [monthKey, storeId, region, selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const dateMap = useMemo(() => {
    const map = new Map<string, SupportRequestsMonthResponse["dates"][number]["stores"]>();
    for (const d of data?.dates ?? []) map.set(d.date, d.stores);
    return map;
  }, [data?.dates]);

  const selectedStores = selectedDate ? dateMap.get(selectedDate) ?? [] : [];

  const regionOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of data?.meta.stores ?? []) {
      if (s.region) set.add(s.region);
    }
    const list = [...set];
    list.sort((a, b) => a.localeCompare(b));
    return list;
  }, [data?.meta.stores]);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">人力支援管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            月曆熱力圖總覽 · 點選日期查看明細
            {data ? ` · ${data.startDate} ~ ${data.endDate}` : ""}
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
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-white disabled:opacity-50"
            title="重新整理"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/operations/supervision"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          >
            返回督導管理
          </Link>
        </div>
      </div>

      {data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="本月支援申請件數"
            value={String(data.summary.requestCount)}
            tone="neutral"
          />
          <SummaryCard
            title="已補齊（實際）"
            value={`${data.summary.coveredCountActual} / ${data.summary.requestCount}`}
            sub={data.summary.coveredRateActual != null ? `補齊率 ${data.summary.coveredRateActual}%` : "—"}
            tone="success"
          />
          <SummaryCard
            title="仍缺人（實際）"
            value={String(data.summary.shortageCountActual)}
            tone="danger"
          />
          <SummaryCard
            title="跨店支援總時數"
            value={`${data.summary.crossStoreSupportHoursConfirmed.toFixed(1)}h`}
            sub={`待確認 ${data.summary.crossStoreSupportHoursPlanned.toFixed(1)}h`}
            tone="info"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          <button
            type="button"
            onClick={() => setLayer("actual")}
            className={`rounded-md px-3 py-1.5 ${layer === "actual" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            實際（已確認）
          </button>
          <button
            type="button"
            onClick={() => setLayer("planned")}
            className={`rounded-md px-3 py-1.5 ${layer === "planned" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            計畫（含待確認）
          </button>
        </div>
        <p className="text-xs text-slate-500">
          月曆顏色依所選層級：綠=補齊、黃=部分、紅=缺口 · 今日起依排班表預測（無出勤時亦顯示已上傳班表）
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-slate-800">月曆熱力圖</h2>
          <p className="text-xs text-slate-500">點擊日期展開下方明細，再點一次可收起</p>
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
            const sev = layer === "actual" ? d.severityActual : d.severityPlanned;
            const selected = selectedDate === d.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => {
                  if (!d.inMonth) return;
                  setSelectedDate((cur) => (cur === d.date ? null : d.date));
                }}
                className={[
                  "min-h-[54px] rounded-lg border px-2 py-1.5 text-left transition-colors",
                  d.inMonth ? cellBgBySeverity(sev) : "bg-slate-50 border-slate-200 text-slate-400",
                  selected ? "ring-2 ring-blue-600" : "",
                ].join(" ")}
                title={d.inMonth ? `${d.date} · ${d.storeCount} 間` : d.date}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${d.inMonth ? "text-slate-800" : "text-slate-400"}`}>
                    {d.day}
                  </span>
                  {d.inMonth && d.storeCount > 0 ? (
                    <span className="rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] text-slate-600">
                      {d.storeCount} 間
                    </span>
                  ) : null}
                </div>
                {d.inMonth && d.storeCount > 0 ? (
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] ${badgeClassBySeverity(sev)}`}>
                    {severityLabel(sev)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">日期明細</h2>
              <p className="text-xs text-slate-500 mt-0.5">{selectedDate}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="text-sm text-slate-600 hover:underline"
            >
              收起
            </button>
          </div>

          {selectedStores.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">此日無缺口或支援紀錄</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedStores.map((s) => {
                const isOpen = openStoreIds.has(s.storeId);
                const isForecast = s.dataSource === "forecast";
                const status = layer === "actual" ? s.statusActual : s.statusPlanned;
                const target = s.targetHours != null ? s.targetHours.toFixed(1) : "—";
                const laborLabel = isForecast ? "排班" : "實際";
                const laborHours = isForecast
                  ? (s.scheduledHours ?? s.actualHoursConfirmed).toFixed(1)
                  : s.actualHoursConfirmed.toFixed(1);
                const supportEffective =
                  layer === "actual" ? s.supportInConfirmedHours : s.supportInConfirmedHours + s.supportInPlannedHours;
                const gap =
                  layer === "actual" ? s.gapConfirmed : s.gapPlanned;
                const gapText = gap == null ? "—" : gap.toFixed(1);

                return (
                  <div
                    key={s.storeId}
                    className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenStoreIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.storeId)) next.delete(s.storeId);
                          else next.add(s.storeId);
                          return next;
                        })
                      }
                      className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {s.storeName}
                            {s.region ? <span className="ml-2 text-xs text-slate-500">{s.region}</span> : null}
                            {isForecast ? (
                              <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">
                                預測
                              </span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                            缺口 {gapText}h（目標 {target}h · {laborLabel} {laborHours}h · 支援{" "}
                            {supportEffective.toFixed(1)}h）
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-2 py-1 text-xs font-medium ${badgeClassBySeverity(status)}`}>
                            {severityLabel(status)}
                          </span>
                          <span className="text-slate-500 text-xs">{isOpen ? "▲" : "▼"}</span>
                        </div>
                      </div>
                    </button>

                    <div
                      className={`px-3 py-3 space-y-4 transition-all duration-200 ${
                        isOpen ? "block" : "hidden"
                      }`}
                    >
                      <div>
                        <h3 className="text-xs font-semibold text-slate-700 mb-2">
                          {isForecast ? "排班人員" : "原班出勤"}
                        </h3>
                        {s.originalStaff.length === 0 ? (
                          <p className="text-xs text-slate-500">
                            {isForecast ? "尚無排班資料（請至資料上傳中心上傳班表）" : "無出勤紀錄"}
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-slate-500 text-xs">
                                  <th className="py-2 pr-3">人員</th>
                                  <th className="py-2 pr-3 text-right">
                                    {isForecast ? "排班時數" : "出勤時數"}
                                  </th>
                                  <th className="py-2">時間</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.originalStaff.map((r) => (
                                  <tr key={r.employeeId} className="border-b border-slate-100">
                                    <td className="py-2 pr-3">
                                      {r.employeeName}
                                      <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                                    </td>
                                    <td className="py-2 pr-3 text-right tabular-nums">
                                      {r.workHours.toFixed(2)}h
                                    </td>
                                    <td className="py-2 text-slate-600 text-xs">
                                      {r.startTime && r.endTime ? `${r.startTime}~${r.endTime}` : "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-slate-700 mb-2">支援人員（已確認）</h3>
                        {s.supportStaffConfirmed.length === 0 ? (
                          <p className="text-xs text-slate-500">無</p>
                        ) : (
                          <div className="space-y-2">
                            {s.supportStaffConfirmed.map((r) => (
                              <div key={`${r.employeeId}-${r.filledAt ?? ""}`} className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-900">
                                    {r.employeeName}
                                    <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                                    {r.fromStoreName ? (
                                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
                                        來自 {r.fromStoreName}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-sm font-semibold text-emerald-800 tabular-nums">
                                    {r.hours.toFixed(2)}h
                                  </p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {r.startTime && r.endTime ? `${r.startTime}~${r.endTime}` : "—"}
                                  {r.createdByName ? ` · 填寫人 ${r.createdByName}` : ""}
                                  {r.filledAt ? ` · ${r.filledAt}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-slate-700 mb-2">支援人員（待確認）</h3>
                        {s.supportStaffPlanned.length === 0 ? (
                          <p className="text-xs text-slate-500">無</p>
                        ) : (
                          <div className="space-y-2">
                            {s.supportStaffPlanned.map((r) => (
                              <div key={`${r.employeeId}-${r.filledAt ?? ""}-planned`} className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-900">
                                    {r.employeeName}
                                    <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                                    {r.fromStoreName ? (
                                      <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] text-blue-800">
                                        來自 {r.fromStoreName}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="text-sm font-semibold text-slate-700 tabular-nums">
                                    {r.hours.toFixed(2)}h
                                  </p>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">
                                  {r.startTime && r.endTime ? `${r.startTime}~${r.endTime}` : "—"}
                                  {r.createdByName ? ` · 填寫人 ${r.createdByName}` : ""}
                                  {r.filledAt ? ` · ${r.filledAt}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

