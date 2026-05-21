"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";

type StoreOption = { id: string; storeName: string; region: string };

type WorkHoursData = {
  startDate: string;
  endDate: string;
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
      storeName: string;
      types: string[];
      detail: string;
    }[];
  };
  perCapita: {
    companyAvgPerCapita: number | null;
    topStore: { storeName: string; perCapita: number } | null;
    bottomStore: { storeName: string; perCapita: number } | null;
    ranking: {
      storeName: string;
      headcount: number;
      totalHours: number;
      perCapita: number;
      deviationPct: number | null;
    }[];
  };
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

const TABS = [
  { id: "overview", label: "工時概況", icon: BarChart3 },
  { id: "anomaly", label: "異常偵測", icon: AlertTriangle },
  { id: "perCapita", label: "人均產值", icon: TrendingUp },
  { id: "adjustments", label: "特殊調整", icon: Clock },
] as const;

type TabId = (typeof TABS)[number]["id"];

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function OperationsWorkHoursPage() {
  const init = currentYearMonth();
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [tab, setTab] = useState<TabId>("overview");
  const [data, setData] = useState<WorkHoursData | null>(null);
  const [loading, setLoading] = useState(false);

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
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (storeId) params.set("storeId", storeId);
      const res = await fetch(`/api/operations/work-hours?${params}`);
      if (res.ok) setData(await res.json());
      else setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const o = data?.overview;
  const a = data?.anomalies;
  const p = data?.perCapita;
  const adj = data?.adjustments;

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">人員工時管理</h1>
          <p className="text-sm text-slate-500 mt-1">
            工時概況 · 異常偵測 · 人均產值 · 特殊調整紀錄
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
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[140px] rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">全部門市</option>
            {stores.map((s) => (
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
                tab === t.id ?
                  "border-slate-800 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && !data ?
        <p className="text-center text-slate-500 py-16">載入中…</p>
      : null}

      {data && tab === "overview" ?
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="總正班工時"
              value={`${o?.totalRegularHours ?? 0}h`}
              icon={<Clock className="h-5 w-5 text-blue-600" />}
              bg="bg-blue-50"
            />
            <SummaryCard
              title="總加班工時"
              value={`${o?.totalOvertimeHours ?? 0}h`}
              icon={<TrendingUp className="h-5 w-5 text-violet-600" />}
              bg="bg-violet-50"
            />
            <SummaryCard
              title="記錄人員數"
              value={String(o?.employeeCount ?? 0)}
              icon={<Users className="h-5 w-5 text-amber-600" />}
              bg="bg-amber-50"
            />
            <SummaryCard
              title="工時異常人數"
              value={String(o?.anomalyPersonCount ?? 0)}
              icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
              bg="bg-red-50"
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
                          <span className="inline-flex items-center gap-1.5">
                            {s.hasAnomaly ?
                              <AlertTriangle
                                className="h-4 w-4 shrink-0 text-amber-500"
                                aria-label="本月有工時異常人員"
                              />
                            : null}
                            {s.storeName}
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

      {data && tab === "anomaly" ?
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AnomalyCountCard label="加班過多" count={a?.counts.excessiveOvertime ?? 0} bg="bg-sky-50" />
            <AnomalyCountCard label="缺勤異常" count={a?.counts.absence ?? 0} bg="bg-rose-50" />
            <AnomalyCountCard label="打卡異常" count={a?.counts.clockAnomaly ?? 0} bg="bg-amber-50" />
            <AnomalyCountCard label="工時不足" count={a?.counts.insufficient ?? 0} bg="bg-orange-50" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">異常人員明細</h2>
            {a?.list.length ?
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-3">員工</th>
                      <th className="py-2 pr-3">門市</th>
                      <th className="py-2 pr-3">異常類型</th>
                      <th className="py-2">說明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.list.map((r) => (
                      <tr key={r.employeeId} className="border-b border-slate-100">
                        <td className="py-2 pr-3">
                          {r.employeeName}
                          <span className="ml-1 text-xs text-slate-400">{r.employeeCode}</span>
                        </td>
                        <td className="py-2 pr-3">{r.storeName}</td>
                        <td className="py-2 pr-3">{r.types.join("、")}</td>
                        <td className="py-2 text-slate-600">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            : <EmptyState text="本月無工時異常記錄" />}
          </div>
        </>
      : null}

      {data && tab === "perCapita" ?
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-5">
              <p className="text-sm text-blue-800">全店平均工時</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">
                {p?.companyAvgPerCapita != null ? `${p.companyAvgPerCapita}h` : "—"}
              </p>
              <p className="text-xs text-blue-700 mt-1">每人每月</p>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-5">
              <p className="text-sm text-emerald-800">最高門市</p>
              <p className="mt-2 text-xl font-bold text-emerald-900">
                {p?.topStore?.storeName ?? "—"}
              </p>
              <p className="text-xs text-emerald-700">
                {p?.topStore ? `${p.topStore.perCapita}h / 人` : "0h / 人"}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-5">
              <p className="text-sm text-amber-800">最低門市</p>
              <p className="mt-2 text-xl font-bold text-amber-900">
                {p?.bottomStore?.storeName ?? "—"}
              </p>
              <p className="text-xs text-amber-700">
                {p?.bottomStore ? `${p.bottomStore.perCapita}h / 人` : "0h / 人"}
              </p>
            </div>
          </div>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            本頁為「人均工時」（正班+加班 ÷ 人員數）。真實人均產值（營收÷工時）請參考業績分析。
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-3">門市人均工時排名</h2>
            {p?.ranking.length ?
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="py-2 pr-3">排名</th>
                      <th className="py-2 pr-3">門市</th>
                      <th className="py-2 pr-3 text-right">人員數</th>
                      <th className="py-2 pr-3 text-right">總工時</th>
                      <th className="py-2 pr-3 text-right">人均工時</th>
                      <th className="py-2 text-right">與均值偏差</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.ranking.map((r, i) => (
                      <tr key={r.storeName} className="border-b border-slate-100">
                        <td className="py-2 pr-3 text-slate-400">{i + 1}</td>
                        <td className="py-2 pr-3 font-medium">{r.storeName}</td>
                        <td className="py-2 pr-3 text-right">{r.headcount}</td>
                        <td className="py-2 pr-3 text-right">{r.totalHours}h</td>
                        <td className="py-2 pr-3 text-right font-semibold text-blue-800">
                          {r.perCapita}h
                        </td>
                        <td className="py-2 text-right">
                          {r.deviationPct != null ?
                            `${r.deviationPct > 0 ? "+" : ""}${r.deviationPct}%`
                          : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            : <EmptyState text="尚無排名資料" />}
          </div>
        </>
      : null}

      {data && tab === "adjustments" ?
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-sm text-slate-500">記錄筆數</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{adj?.recordCount ?? 0}</p>
            </div>
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-4 text-center">
              <p className="text-sm text-sky-700">加時合計</p>
              <p className="text-3xl font-bold text-sky-900 mt-1">+{adj?.addHours ?? 0}h</p>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center">
              <p className="text-sm text-amber-800">減時合計</p>
              <p className="text-3xl font-bold text-amber-900 mt-1">{adj?.deductHours ?? 0}h</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-800 mb-1">特殊工時調整明細</h2>
            <p className="text-xs text-slate-500 mb-3">
              含人力支援、儲備人力、效期/清掃/現貨文登記等工時異動
            </p>
            {adj?.rows.length ?
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
                    {adj.rows.map((r) => (
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
                        <td
                          className={`py-2 pr-3 text-right font-medium ${
                            r.hours > 0 ? "text-sky-700" : r.hours < 0 ? "text-amber-700" : ""
                          }`}
                        >
                          {r.hours > 0 ? "+" : ""}
                          {r.hours}h
                        </td>
                        <td className="py-2 text-slate-500 text-xs max-w-[200px] truncate">
                          {r.note ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            : <EmptyState text="本月尚無特殊工時調整記錄" />}
          </div>
        </>
      : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  bg,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-100 p-4 ${bg}`}>
      <div className="flex items-center gap-2 text-slate-600">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function AnomalyCountCard({
  label,
  count,
  bg,
}: {
  label: string;
  count: number;
  bg: string;
}) {
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
