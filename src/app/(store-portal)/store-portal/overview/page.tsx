"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

type StoreContext = {
  storeName: string;
  region: string | null;
  retailStoreId: string;
  performanceStoreId: string | null;
};

type DashMetrics = {
  totalRevenue: number;
  revenueForecast: number | null;
  revenueAchievement: number;
  revenueAchievementRate: number | null;
  yoyGrowthRate: number | null;
  efficiencyRatio: number | null;
  customerCount?: number;
  avgOrderValue?: number | null;
};

type TargetWeek = {
  index: number;
  startYmd: string;
  endYmd: string;
  workingDays: number;
};

type TargetRow = {
  storeId: string;
  byWeek: { metDays: number; exceedDays: number; total: number }[];
};

type TargetData = {
  weeks: TargetWeek[];
  stores: TargetRow[];
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 10000).toFixed(0)}萬`;
  if (n >= 1_000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtYoy(r: number | null) {
  if (r == null) return "—";
  const sign = r >= 0 ? "+" : "";
  return `${sign}${r.toFixed(1)}%`;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 = last day of prev month
  return toYmd(d);
}

function fmtMd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}/${Number(m[3])}`;
}

export default function StoreOverviewPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const now = new Date();

  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [ctx, setCtx] = useState<StoreContext | null>(null);
  const [metrics, setMetrics] = useState<DashMetrics | null>(null);
  const [target, setTarget] = useState<TargetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCurrentMonth =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1;

  const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  const startDate = `${monthStr}-01`;
  const endDate = isCurrentMonth ? toYmd(now) : lastDayOfMonth(selectedYear, selectedMonth);

  function prevMonth() {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (isCurrentMonth) return;
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMetrics(null);
    setTarget(null);
    try {
      const ctxUrl = adminStoreId
        ? `/api/store-portal/context?storeId=${encodeURIComponent(adminStoreId)}`
        : "/api/store-portal/context";
      const ctxRes = await fetch(ctxUrl);
      if (!ctxRes.ok) throw new Error("無法取得門市資訊");
      const ctxData = (await ctxRes.json()) as StoreContext;
      setCtx(ctxData);

      const [dashRes, targetRes] = await Promise.all([
        ctxData.performanceStoreId
          ? fetch(
              `/api/operations/dashboard?storeId=${encodeURIComponent(ctxData.performanceStoreId)}&startDate=${startDate}&endDate=${endDate}`
            )
          : Promise.resolve(null),
        fetch(`/api/reports/store-target-card?month=${encodeURIComponent(monthStr)}`),
      ]);

      if (dashRes && dashRes.ok) {
        const dashData = await dashRes.json();
        const m = dashData.filteredMetrics as DashMetrics | undefined;
        if (m) setMetrics(m);
      }

      if (targetRes.ok) {
        setTarget((await targetRes.json()) as TargetData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId, startDate, endDate, monthStr]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fix: use performanceStoreId (Store.id) to match store-target-card data
  const storeTarget = ctx?.performanceStoreId
    ? target?.stores.find((s) => s.storeId === ctx.performanceStoreId)
    : null;
  const totalMet = storeTarget?.byWeek.reduce((a, w) => a + w.metDays, 0) ?? 0;
  const totalOver = storeTarget?.byWeek.reduce((a, w) => a + w.exceedDays, 0) ?? 0;
  const totalWd = target?.weeks.reduce((a, w) => a + w.workingDays, 0) ?? 0;

  const displayPct =
    metrics?.revenueForecast && metrics.revenueAchievement
      ? Math.round((metrics.revenueAchievement / metrics.revenueForecast) * 100)
      : metrics?.revenueAchievementRate
        ? Math.round(Number(metrics.revenueAchievementRate))
        : null;

  const yoy = metrics?.yoyGrowthRate ?? null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">業績總覽</h1>
          <p className="text-xs text-slate-400">
            {isCurrentMonth ? `截至 ${endDate}` : `${startDate} – ${endDate}`}
          </p>
        </div>

        {/* 月份切換 */}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="flex items-center gap-0.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft size={12} />
            上個月
          </button>
          <span className="min-w-[72px] text-center text-xs font-medium text-slate-700">
            {selectedYear}年{selectedMonth}月
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="flex items-center gap-0.5 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
          >
            下個月
            <ChevronRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="ml-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : (
          <>
            {/* 主要指標：營業額 + YoY */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: "#E1F5EE" }}>
                <p className="mb-1 text-[11px]" style={{ color: "#0F6E56" }}>本月營業額</p>
                <p className="text-2xl font-medium" style={{ color: "#085041" }}>
                  {metrics ? fmt(metrics.revenueAchievement ?? metrics.totalRevenue) : "—"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {displayPct != null && (
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "#9FE1CB", color: displayPct >= 100 ? "#085041" : "#3B6D11" }}
                    >
                      {displayPct}% 達成
                    </span>
                  )}
                  {metrics?.revenueForecast && (
                    <span className="text-[11px]" style={{ color: "#0F6E56" }}>
                      目標 {fmt(metrics.revenueForecast)}
                    </span>
                  )}
                </div>
              </div>

              <div
                className="rounded-xl p-4"
                style={{ background: yoy == null ? "#F1EFE8" : yoy >= 0 ? "#EAF3DE" : "#FCEBEB" }}
              >
                <p
                  className="mb-1 text-[11px]"
                  style={{ color: yoy == null ? "#5F5E5A" : yoy >= 0 ? "#3B6D11" : "#A32D2D" }}
                >
                  去年同期成長
                </p>
                <p
                  className="text-2xl font-medium"
                  style={{ color: yoy == null ? "#888780" : yoy >= 0 ? "#27500A" : "#791F1F" }}
                >
                  {fmtYoy(yoy)}
                </p>
                <div className="mt-2">
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: yoy == null ? "#D3D1C7" : yoy >= 0 ? "#C0DD97" : "#F7C1C1",
                      color: yoy == null ? "#444441" : yoy >= 0 ? "#27500A" : "#791F1F",
                    }}
                  >
                    {yoy == null ? "無資料" : yoy >= 0 ? "年增長" : "YoY 下滑"}
                  </span>
                </div>
              </div>
            </div>

            {/* 次要指標：工效比 + 達標天數 + 來客數 */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3" style={{ background: "#E6F1FB" }}>
                <p className="mb-1 text-[11px]" style={{ color: "#185FA5" }}>工效比</p>
                <p className="text-lg font-medium" style={{ color: "#0C447C" }}>
                  {metrics?.efficiencyRatio != null
                    ? `$${Math.round(metrics.efficiencyRatio).toLocaleString()}`
                    : "—"}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: "#185FA5" }}>元 / hr</p>
              </div>

              <div className="rounded-xl p-3" style={{ background: "#FAEEDA" }}>
                <p className="mb-1 text-[11px]" style={{ color: "#854F0B" }}>達標天數</p>
                <p className="text-lg font-medium" style={{ color: "#633806" }}>
                  {totalWd > 0 ? `${totalMet}` : "—"}
                  {totalWd > 0 && (
                    <span className="ml-1 text-xs font-normal" style={{ color: "#854F0B" }}>
                      / {totalWd} 天
                    </span>
                  )}
                </p>
                {totalOver > 0 && (
                  <p className="mt-1 text-[11px]" style={{ color: "#633806" }}>超標 {totalOver} 天</p>
                )}
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="mb-1 text-[11px] text-slate-400">來客數</p>
                <p className="text-lg font-medium text-slate-800">
                  {metrics?.customerCount != null && metrics.customerCount > 0
                    ? metrics.customerCount.toLocaleString("zh-TW")
                    : "—"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">本月累計</p>
              </div>
            </div>

            {/* 進度條 */}
            {metrics?.revenueForecast && metrics.revenueAchievement != null && (
              <div className="mb-3 rounded-xl bg-slate-50 p-4">
                <p className="mb-3 text-sm font-bold text-slate-700">月目標進度</p>
                <div className="mb-3">
                  <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                    <span>營業額</span>
                    <span className="font-medium">
                      {fmt(metrics.revenueAchievement)} / {fmt(metrics.revenueForecast)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((metrics.revenueAchievement / metrics.revenueForecast) * 100))}%`,
                        background: "#1D9E75",
                      }}
                    />
                  </div>
                </div>
                {totalWd > 0 && (
                  <div>
                    <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                      <span>達標天數</span>
                      <span className="font-medium">{totalMet + totalOver} 天 / {totalWd} 天</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round(((totalMet + totalOver) / totalWd) * 100))}%`,
                          background: "#BA7517",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 週別達標 */}
            {target && storeTarget && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="mb-3 text-sm font-bold text-slate-700">週別達標</p>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${target.weeks.length}, 1fr)` }}
                >
                  {target.weeks.map((w, i) => {
                    const wk = storeTarget.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
                    const hasMet = wk.metDays > 0 || wk.exceedDays > 0;
                    return (
                      <div
                        key={w.index}
                        className="rounded-lg p-2 text-center"
                        style={{
                          background: hasMet ? "#E1F5EE" : "#fff",
                          border: `0.5px solid ${hasMet ? "#9FE1CB" : "#e2e8f0"}`,
                        }}
                      >
                        <div className="mb-1 text-[9px] text-slate-400">
                          W{w.index} {fmtMd(w.startYmd)}–{fmtMd(w.endYmd)}
                        </div>
                        <div className="text-sm font-medium" style={{ color: "#085041" }}>
                          達標 {wk.metDays}
                        </div>
                        {wk.exceedDays > 0 && (
                          <div className="text-xs font-medium text-purple-600">
                            超標 {wk.exceedDays}
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400">{w.workingDays} 工作日</div>
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
