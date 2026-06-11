"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";

type StoreOption = { id: string; storeName: string; region: string };

type WorkHoursData = {
  startDate: string;
  endDate: string;
  laborHourTarget: number | null;
  overview: {
    totalRegularHours: number;
    totalOvertimeHours: number;
    employeeCount: number;
    anomalyPersonCount: number;
    storeSummary: {
      storeId: string;
      storeName: string;
      headcount: number;
      totalHours: number;
      regularHours: number;
      overtimeHours: number;
      hasAnomaly?: boolean;
    }[];
  };
  anomalies: {
    counts: {
      excessiveOvertime: number;
      absence: number;
      clockAnomaly: number;
      insufficient: number;
    };
    list: {
      employeeId: string;
      employeeName: string;
      employeeCode: string;
      storeId: string;
      storeName: string;
      types: string[];
      detail: string;
    }[];
    monthlyOvertime: {
      employeeId: string;
      employeeName: string;
      employeeCode: string;
      storeName: string;
      overtimeHours: number;
      alertRatioPct: number;
    }[];
  };
  employeeSummary: {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    storeId: string;
    storeName: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
  }[];
  adjustments: {
    recordCount: number;
    addHours: number;
    deductHours: number;
    rows: {
      id: string;
      workDate: string;
      category: string;
      storeName: string;
      employeeName: string;
      employeeCode: string;
      hours: number;
      note: string | null;
    }[];
  };
};

type CalendarStaff = {
  name: string;
  workHours: number;
  startTime: string;
  endTime: string;
  homeStore: string | null;
  isSupport: boolean;
};

type CalendarDeduction = {
  label: string;
  hours: number;
  note?: string | null;
};

type CalendarDay = {
  date: string;
  weekday: number;
  holiday: string | null;
  staff: CalendarStaff[];
  deductions: CalendarDeduction[];
  efficiencyRatio: number | null;
  isAchieved: boolean;
  hasData: boolean;
};

type CalendarData = {
  storeName: string;
  days: CalendarDay[];
  employeeAchievement: {
    name: string;
    homeStore: string | null;
    isSupport: boolean;
    attendanceDays: number;
    achievedDays: number;
    achieveRate: number;
  }[];
};

const TABS = [
  { id: "overview", label: "工時概況", icon: BarChart3 },
  { id: "calendar", label: "門市日曆", icon: CalendarDays },
  { id: "issues", label: "異常與調整", icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]["id"];

const ANOMALY_FILTERS = [
  { id: "all", label: "全部異常" },
  { id: "加班過多", label: "加班過多" },
  { id: "缺勤異常", label: "缺勤異常" },
  { id: "打卡異常", label: "打卡異常" },
  { id: "工時不足", label: "工時不足" },
] as const;

type AnomalyFilterId = (typeof ANOMALY_FILTERS)[number]["id"];

type DetailModalKind =
  | "regular"
  | "overtime"
  | "employees"
  | "anomalies"
  | "storeAnomaly";

type DetailModalState = {
  kind: DetailModalKind;
  storeId?: string;
  storeName?: string;
} | null;

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const CAL_DOW_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

export default function OperationsWorkHoursPage() {
  const init = currentYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [tab, setTab] = useState<TabId>("overview");
  const [anomalyFilter, setAnomalyFilter] = useState<AnomalyFilterId>("all");
  const [data, setData] = useState<WorkHoursData | null>(null);
  const [calData, setCalData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [calLoading, setCalLoading] = useState(false);
  const [detailModal, setDetailModal] = useState<DetailModalState>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/operations/dashboard");
      if (res.ok) {
        const json = await res.json();
        setStores(json.meta?.stores ?? []);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/operations/work-hours?${params}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, storeId]);

  const loadCalendar = useCallback(async () => {
    if (!storeId) { setCalData(null); return; }
    setCalLoading(true);
    try {
      const params = new URLSearchParams({ storeId, year: String(year), month: String(month) });
      const res = await fetch(`/api/operations/work-hours/calendar?${params}`);
      if (res.ok) setCalData(await res.json());
      else setCalData(null);
    } finally {
      setCalLoading(false);
    }
  }, [storeId, year, month]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab === "calendar") void loadCalendar();
  }, [tab, loadCalendar]);

  const o = data?.overview;
  const a = data?.anomalies;
  const adj = data?.adjustments;
  const employees = data?.employeeSummary ?? [];

  const totalHours = (o?.totalRegularHours ?? 0) + (o?.totalOvertimeHours ?? 0);
  const overtimeRate =
    totalHours > 0 ? Math.round(((o?.totalOvertimeHours ?? 0) / totalHours) * 1000) / 10 : 0;

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">人員工時管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            工時概況 · 門市日曆 · 異常與調整
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
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部門市</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.storeName}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => { void load(); if (tab === "calendar") void loadCalendar(); }}
            disabled={loading}
            className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-white disabled:opacity-50"
            title="重新整理"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id
                  ? "border-slate-800 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && loading && !data ?
        <p className="text-center text-slate-500 py-16">載入中…</p>
      : null}

      {tab === "overview" && data ?
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="目標工時"
              value={data.laborHourTarget != null ? `${data.laborHourTarget}h` : "—"}
              sub={storeId ? "本月門市工時目標" : "請選擇單一門市"}
              icon={<Clock className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
            />
            <SummaryCard
              title="正班工時"
              value={`${o?.totalRegularHours ?? 0}h`}
              sub={data.laborHourTarget != null && o?.totalRegularHours != null
                ? `達成 ${Math.round((o.totalRegularHours / data.laborHourTarget) * 1000) / 10}%`
                : undefined}
              icon={<TrendingUp className="h-5 w-5 text-violet-600" />}
              bg="bg-violet-50"
              onClick={() => setDetailModal({ kind: "regular" })}
            />
            <SummaryCard
              title="加班工時"
              value={`${o?.totalOvertimeHours ?? 0}h`}
              sub={`加班率 ${overtimeRate}%`}
              icon={<Users className="h-5 w-5 text-amber-600" />}
              bg="bg-amber-50"
              onClick={() => setDetailModal({ kind: "overtime" })}
            />
            <SummaryCard
              title="工時異常人數"
              value={String(o?.anomalyPersonCount ?? 0)}
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              bg="bg-red-50"
              onClick={() => setDetailModal({ kind: "anomalies" })}
            />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">門市工時彙總</h2>
            {o?.storeSummary.length ?
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-4">門市</th>
                      <th className="py-2 pr-4 text-right">人員數</th>
                      <th className="py-2 pr-4 text-right">總工時</th>
                      <th className="py-2 pr-4 text-right">正班</th>
                      <th className="py-2 text-right">加班</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.storeSummary.map((s) => (
                      <tr key={s.storeId} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            {s.storeName}
                            {s.hasAnomaly ?
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailModal({ kind: "storeAnomaly", storeId: s.storeId, storeName: s.storeName })
                                }
                                className="inline-flex rounded p-0.5 text-amber-500 hover:bg-amber-100 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                title="查看工時異常明細"
                              >
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                              </button>
                            : null}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right">{s.headcount}</td>
                        <td className="py-2 pr-4 text-right">{s.totalHours}h</td>
                        <td className="py-2 pr-4 text-right">{s.regularHours}h</td>
                        <td className="py-2 text-right">{s.overtimeHours}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            : <EmptyState text="本月尚無工時紀錄" />}
          </div>
        </>
      : null}

      {tab === "calendar" ?
        <CalendarTab
          storeId={storeId}
          data={calData}
          loading={calLoading}
          onLoad={() => void loadCalendar()}
        />
      : null}

      {tab === "issues" ?
        data ?
          <IssuesTab
            anomalies={a}
            adjustments={adj}
            anomalyFilter={anomalyFilter}
            onAnomalyFilterChange={setAnomalyFilter}
          />
        : loading ?
          <p className="text-center text-slate-500 py-16">載入中…</p>
        : <div className="text-center py-16">
            <p className="text-sm text-slate-500 mb-3">資料載入失敗，請重新整理</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              重新整理
            </button>
          </div>
      : null}

      {detailModal && data ?
        <WorkHoursDetailModal
          state={detailModal}
          employees={employees}
          anomalies={a?.list ?? []}
          onClose={() => setDetailModal(null)}
        />
      : null}
    </div>
  );
}

function CalendarTab({
  storeId,
  data,
  loading,
  onLoad,
}: {
  storeId: string;
  data: CalendarData | null;
  loading: boolean;
  onLoad: () => void;
}) {
  if (!storeId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
        請在上方篩選器選擇單一門市，即可查看該門市的月曆出勤與達標紀錄。
      </div>
    );
  }

  if (loading) {
    return <p className="text-center text-slate-500 py-16">載入中…</p>;
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-slate-500 mb-3">尚未載入日曆資料</p>
        <button
          type="button"
          onClick={onLoad}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          載入日曆
        </button>
      </div>
    );
  }

  const firstDay = data.days[0];
  const leadingEmpties = firstDay ? firstDay.weekday : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800 flex flex-wrap gap-4 items-center">
        <span>達標條件：平日工效比 ≥ 4,000 元/hr、週六 ≥ 5,500 元/hr</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-400" />本店人員
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />跨店支援
        </span>
        <span className="text-rose-600">-Xh 標籤 = 扣工時項目</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[560px]">
          {CAL_DOW_LABELS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"
              }`}
            >
              {d}
            </div>
          ))}
          {Array.from({ length: leadingEmpties }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {data.days.map((day) => {
            const dom = parseInt(day.date.slice(8), 10);
            const isSun = day.weekday === 0;
            const isSat = day.weekday === 6;
            const isHoliday = !!day.holiday;
            return (
              <div
                key={day.date}
                className={`border rounded-lg p-1.5 min-h-[90px] text-xs ${
                  isHoliday
                    ? "border-orange-200 bg-orange-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`font-semibold ${
                      isSun || isHoliday ? "text-red-500" : isSat ? "text-blue-500" : "text-slate-700"
                    }`}
                  >
                    {dom}
                  </span>
                  {day.hasData ?
                    day.isAchieved ?
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        達標
                      </span>
                    : <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        未達
                      </span>
                  : null}
                </div>
                {day.holiday ?
                  <div className="text-[10px] text-orange-600 font-medium mb-1 truncate">
                    {day.holiday}
                  </div>
                : null}
                {day.staff.map((s, si) => (
                  <div key={si} className="flex items-center gap-1 mb-0.5">
                    <span
                      className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                        s.isSupport ? "bg-amber-400" : "bg-teal-400"
                      }`}
                    />
                    <span className="truncate text-slate-600">
                      {s.name}
                      {s.workHours > 0 ?
                        <span className="text-slate-400 ml-0.5">{s.workHours}h</span>
                      : null}
                      {s.isSupport && s.homeStore ?
                        <span className="text-amber-600 ml-0.5">（{s.homeStore}）</span>
                      : null}
                    </span>
                  </div>
                ))}
                {day.deductions.length > 0 ?
                  <div className="mt-1 space-y-0.5">
                    {day.deductions.map((d, di) => (
                      <div key={di} className="text-[10px] text-rose-600 truncate" title={d.note ?? undefined}>
                        -{d.hours}h {d.label}
                      </div>
                    ))}
                  </div>
                : null}
                {day.hasData && day.efficiencyRatio != null ?
                  <div className="mt-1 text-[10px] text-slate-400">
                    工效比 {day.efficiencyRatio.toLocaleString()}
                  </div>
                : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">員工達標次數</h2>
        <p className="text-xs text-slate-500 mb-3">
          出勤日中，本門市工效比達標的次數（達標條件與每日工效比報表相同）
        </p>
        {data.employeeAchievement.length ?
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500 font-normal">
                  <th className="py-2 pr-4 font-normal">員工</th>
                  <th className="py-2 pr-4 font-normal">類別</th>
                  <th className="py-2 pr-4 text-right font-normal">出勤工作日</th>
                  <th className="py-2 pr-4 text-right font-normal">達標次數</th>
                  <th className="py-2 text-right font-normal">達標率</th>
                </tr>
              </thead>
              <tbody>
                {data.employeeAchievement.map((e) => (
                  <tr key={e.name} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{e.name}</td>
                    <td className="py-2 pr-4">
                      {e.isSupport ?
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                          {e.homeStore ?? "跨店支援"}
                        </span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400" />
                          本店
                        </span>
                      }
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{e.attendanceDays} 天</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {e.achievedDays} 次
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{e.achieveRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        : <EmptyState text="本月尚無出勤紀錄" />}
      </div>
    </div>
  );
}

function overtimeAlertRowClass(ratioPct: number): string {
  if (ratioPct > 75) return "bg-red-50";
  if (ratioPct > 50) return "bg-amber-50";
  return "bg-emerald-50";
}

function IssuesTab({
  anomalies,
  adjustments,
  anomalyFilter,
  onAnomalyFilterChange,
}: {
  anomalies: WorkHoursData["anomalies"] | undefined;
  adjustments: WorkHoursData["adjustments"] | undefined;
  anomalyFilter: AnomalyFilterId;
  onAnomalyFilterChange: (id: AnomalyFilterId) => void;
}) {
  const filteredList =
    anomalies?.list.filter((r) =>
      anomalyFilter === "all" ? true : r.types.includes(anomalyFilter)
    ) ?? [];
  const monthlyOvertime = anomalies?.monthlyOvertime ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">月加班</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            加班警示 = 月加班時數 ÷ 46h（%）· ≤50% 淡綠、51–75% 淡黃、&gt;75% 淡紅
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {monthlyOvertime.length ?
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">門市</th>
                    <th className="py-2 pr-3">員工</th>
                    <th className="py-2 pr-3 text-right">月加班時數</th>
                    <th className="py-2 text-right">加班警示</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyOvertime.map((r) => (
                    <tr key={r.employeeId} className={`border-b border-slate-100 ${overtimeAlertRowClass(r.alertRatioPct)}`}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.storeName}</td>
                      <td className="py-2 pr-3">
                        {r.employeeName}
                        <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.overtimeHours}h</td>
                      <td className="py-2 text-right tabular-nums font-medium">{r.alertRatioPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <EmptyState text="本月尚無加班時數記錄" />}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">異常偵測</h2>
          <p className="text-xs text-slate-500 mt-0.5">加班過多、缺勤、打卡與工時不足等人員異常</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ANOMALY_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onAnomalyFilterChange(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                anomalyFilter === f.id
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <AnomalyCountCard label="加班過多" count={anomalies?.counts.excessiveOvertime ?? 0} bg="bg-sky-50" />
          <AnomalyCountCard label="缺勤異常" count={anomalies?.counts.absence ?? 0} bg="bg-rose-50" />
          <AnomalyCountCard label="打卡異常" count={anomalies?.counts.clockAnomaly ?? 0} bg="bg-amber-50" />
          <AnomalyCountCard label="工時不足" count={anomalies?.counts.insufficient ?? 0} bg="bg-orange-50" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-medium text-slate-800 mb-3">異常人員明細</h3>
          {filteredList.length ?
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">門市</th>
                    <th className="py-2 pr-3">員工</th>
                    <th className="py-2 pr-3">異常類型</th>
                    <th className="py-2">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((r) => (
                    <tr key={r.employeeId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.storeName}</td>
                      <td className="py-2 pr-3">
                        {r.employeeName}
                        <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                      </td>
                      <td className="py-2 pr-3">{r.types.join("、")}</td>
                      <td className="py-2 text-slate-600">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <EmptyState text={anomalyFilter === "all" ? "本月無工時異常記錄" : "此類型無異常記錄"} />}
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">特殊工時調整</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            人力支援、儲備人力、效期／清掃／現貨文登記等工時異動
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <p className="text-sm text-slate-500">記錄筆數</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{adjustments?.recordCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-sky-50 border border-sky-100 p-4 text-center">
            <p className="text-sm text-sky-700">加時合計</p>
            <p className="text-3xl font-bold text-sky-900 mt-1">+{adjustments?.addHours ?? 0}h</p>
          </div>
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
            <p className="text-sm text-amber-800">減時合計</p>
            <p className="text-3xl font-bold text-amber-900 mt-1">{adjustments?.deductHours ?? 0}h</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-medium text-slate-800 mb-3">調整明細</h3>
          {adjustments?.rows.length ?
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">日期</th>
                    <th className="py-2 pr-3">類型</th>
                    <th className="py-2 pr-3">門市</th>
                    <th className="py-2 pr-3">員工</th>
                    <th className="py-2 pr-3 text-right">時數</th>
                    <th className="py-2">備註</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustments.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 whitespace-nowrap">{r.workDate}</td>
                      <td className="py-2 pr-3">{r.category}</td>
                      <td className="py-2 pr-3">{r.storeName}</td>
                      <td className="py-2 pr-3">
                        {r.employeeName}
                        {r.employeeCode !== "—" ?
                          <span className="text-xs text-slate-400 ml-1">{r.employeeCode}</span>
                        : null}
                      </td>
                      <td className={`py-2 pr-3 text-right font-medium ${
                        r.hours > 0 ? "text-sky-700" : r.hours < 0 ? "text-amber-700" : ""
                      }`}>
                        {r.hours > 0 ? "+" : ""}{r.hours}h
                      </td>
                      <td className="py-2 text-slate-500 text-xs max-w-[200px] truncate">{r.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <EmptyState text="本月尚無特殊工時調整記錄" />}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  sub,
  icon,
  bg,
  onClick,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  bg: string;
  onClick?: () => void;
}) {
  const className = `rounded-xl border border-slate-100 p-4 ${bg} ${
    onClick
      ? "cursor-pointer text-left w-full transition-shadow hover:shadow-md hover:ring-2 hover:ring-slate-300/80 focus:outline-none focus:ring-2 focus:ring-slate-400"
      : ""
  }`;

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-slate-600">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {onClick ? <span className="text-xs text-slate-400">明細</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title="點擊查看明細">
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

function WorkHoursDetailModal({
  state,
  employees,
  anomalies,
  onClose,
}: {
  state: NonNullable<DetailModalState>;
  employees: WorkHoursData["employeeSummary"];
  anomalies: WorkHoursData["anomalies"]["list"];
  onClose: () => void;
}) {
  const storeAnomalyRows =
    state.kind === "storeAnomaly" && state.storeId
      ? anomalies.filter((r) => r.storeId === state.storeId)
      : [];

  let title = "";
  if (state.kind === "regular") title = "正班工時明細";
  else if (state.kind === "overtime") title = "加班工時明細";
  else if (state.kind === "employees") title = "記錄人員明細";
  else if (state.kind === "anomalies") title = "工時異常人員明細";
  else if (state.kind === "storeAnomaly") title = `${state.storeName ?? "門市"} · 工時異常明細`;

  const regularRows = [...employees].filter((e) => e.regularHours > 0).sort((a, b) => b.regularHours - a.regularHours);
  const overtimeRows = [...employees].filter((e) => e.overtimeHours > 0).sort((a, b) => b.overtimeHours - a.overtimeHours);
  const anomalyRows = state.kind === "storeAnomaly" ? storeAnomalyRows : anomalies;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="work-hours-detail-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 id="work-hours-detail-title" className="font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            關閉
          </button>
        </div>
        <div className="overflow-auto p-4">
          {state.kind === "regular" ?
            regularRows.length ?
              <EmployeeHoursTable rows={regularRows} hoursKey="regularHours" hoursLabel="正班工時" />
            : <EmptyState text="尚無正班工時記錄" />
          : state.kind === "overtime" ?
            overtimeRows.length ?
              <EmployeeHoursTable rows={overtimeRows} hoursKey="overtimeHours" hoursLabel="加班工時" />
            : <EmptyState text="尚無加班工時記錄" />
          : state.kind === "employees" ?
            employees.length ?
              <EmployeeHoursTable rows={employees} hoursKey="totalHours" hoursLabel="總工時" showBreakdown />
            : <EmptyState text="尚無人員記錄" />
          : anomalyRows.length ?
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 pr-3">門市</th>
                    <th className="py-2 pr-3">員工</th>
                    <th className="py-2 pr-3">異常類型</th>
                    <th className="py-2">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalyRows.map((r) => (
                    <tr key={r.employeeId} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.storeName}</td>
                      <td className="py-2 pr-3">
                        {r.employeeName}
                        <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                      </td>
                      <td className="py-2 pr-3">{r.types.join("、")}</td>
                      <td className="py-2 text-slate-600">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <EmptyState text="無異常記錄" />}
        </div>
      </div>
    </div>
  );
}

function EmployeeHoursTable({
  rows,
  hoursKey,
  hoursLabel,
  showBreakdown,
}: {
  rows: WorkHoursData["employeeSummary"];
  hoursKey: "regularHours" | "overtimeHours" | "totalHours";
  hoursLabel: string;
  showBreakdown?: boolean;
}) {
  return (
    <div className="overflow-x-auto max-h-[60vh]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b text-left text-slate-500">
            <th className="py-2 pr-3">門市</th>
            <th className="py-2 pr-3">員工</th>
            {showBreakdown ?
              <>
                <th className="py-2 pr-3 text-right">正班</th>
                <th className="py-2 pr-3 text-right">加班</th>
              </>
            : null}
            <th className="py-2 text-right">{hoursLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employeeId} className="border-b border-slate-100">
              <td className="py-2 pr-3 font-medium text-slate-800">{r.storeName}</td>
              <td className="py-2 pr-3">
                {r.employeeName}
                <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
              </td>
              {showBreakdown ?
                <>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.regularHours}h</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.overtimeHours}h</td>
                </>
              : null}
              <td className="py-2 text-right tabular-nums font-medium">{r[hoursKey]}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyCountCard({ label, count, bg }: { label: string; count: number; bg: string }) {
  return (
    <div className={`rounded-xl border border-slate-100 p-5 text-center ${bg}`}>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-2 text-4xl font-bold text-slate-900">{count}</p>
      <p className="text-xs text-slate-500 mt-1">人次</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Clock className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
