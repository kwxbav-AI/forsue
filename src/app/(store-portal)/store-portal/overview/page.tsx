"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

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

function yoyColor(r: number | null) {
  if (r == null) return "text-slate-400";
  if (r > 0) return "text-emerald-700";
  if (r < 0) return "text-red-600";
  return "text-slate-600";
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default function StoreOverviewPage() {
  const searchParams = useSearchParams();
  const adminStoreId = searchParams.get("storeId");
  const [ctx, setCtx] = useState<StoreContext | null>(null);
  const [metrics, setMetrics] = useState<DashMetrics | null>(null);
  const [target, setTarget] = useState<TargetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = toYmd(now);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        const tData = (await targetRes.json()) as TargetData;
        setTarget(tData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [adminStoreId]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeTarget = ctx
    ? target?.stores.find((s) => s.storeId === ctx.retailStoreId)
    : null;
  const totalMet = storeTarget?.byWeek.reduce((a, w) => a + w.metDays, 0) ?? 0;
  const totalOver = storeTarget?.byWeek.reduce((a, w) => a + w.exceedDays, 0) ?? 0;
  const totalWd = target?.weeks.reduce((a, w) => a + w.workingDays, 0) ?? 0;

  const achievePct = metrics?.revenueAchievementRate
    ? Math.round(Number(metrics.revenueAchievementRate))
    : null;
  const forecastPct =
    metrics?.revenueForecast && metrics?.revenueAchievement
      ? Math.round((metrics.revenueAchievement / metrics.revenueForecast) * 100)
      : null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <h1 className="text-sm font-medium text-slate-800">業績總覽</h1>
          <p className="text-xs text-slate-400">
            {monthLabel(now)} · 截至 {endDate}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw size={12} />
        </button>
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
            <div className="mb-3 grid grid-cols-4 gap-2">
              <KpiCard label="本月營業額" value={metrics ? fmt(metrics.revenueAchievement ?? metrics.totalRevenue) : "—"} sub={metrics?.revenueForecast ? `目標 ${fmt(metrics.revenueForecast)}` : "—"} />
              <KpiCard
                label="達成率"
                value={achievePct != null ? `${achievePct}%` : forecastPct != null ? `${forecastPct}%` : "—"}
                sub="本月目標"
                color={achievePct != null ? (achievePct >= 100 ? "text-emerald-700" : achievePct >= 80 ? "text-amber-600" : "text-red-600") : undefined}
              />
              <KpiCard
                label="去年同期成長"
                value={fmtYoy(metrics?.yoyGrowthRate ?? null)}
                sub="YoY"
                color={yoyColor(metrics?.yoyGrowthRate ?? null)}
              />
              <KpiCard
                label="工效比"
                value={metrics?.efficiencyRatio != null ? `$${Math.round(metrics.efficiencyRatio).toLocaleString()}` : "—"}
                sub="元 / hr"
              />
            </div>

            <div className="mb-3 grid grid-cols-3 gap-2">
              <KpiCard
                label="來客數"
                value={metrics?.customerCount != null ? metrics.customerCount.toLocaleString("zh-TW") : "—"}
                sub="本月累計"
              />
              <KpiCard
                label="客單價"
                value={metrics?.avgOrderValue != null ? fmt(metrics.avgOrderValue) : "—"}
                sub="平均"
              />
              <KpiCard
                label="月達標天數"
                value={totalWd > 0 ? `${totalMet} 天` : "—"}
                sub={totalOver > 0 ? `超標 ${totalOver} 天` : `共 ${totalWd} 工作日`}
                color={totalMet > 0 ? "text-emerald-700" : undefined}
              />
            </div>

            {metrics?.revenueForecast && metrics.revenueAchievement != null && (
              <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
                <p className="mb-3 text-[11px] font-medium text-slate-500">月目標進度</p>
                <ProgressBar
                  label="營業額達成"
                  current={metrics.revenueAchievement}
                  target={metrics.revenueForecast}
                  color="bg-emerald-300"
                />
                {totalWd > 0 && (
                  <ProgressBar
                    label="達標天數"
                    current={totalMet + totalOver}
                    target={totalWd}
                    color="bg-sky-300"
                    fmt={(v) => `${v} 天`}
                  />
                )}
              </div>
            )}

            {target && storeTarget && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="mb-3 text-[11px] font-medium text-slate-500">週別達標</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${target.weeks.length}, 1fr)` }}>
                  {target.weeks.map((w, i) => {
                    const wk = storeTarget.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
                    const label = `W${w.index} ${fmtMd(w.startYmd)}–${fmtMd(w.endYmd)}`;
                    return (
                      <div
                        key={w.index}
                        className={`rounded-lg border p-2 text-center ${wk.total > 0 ? "border-emerald-100 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}
                      >
                        <div className="mb-1 text-[9px] text-slate-400">{label}</div>
                        <div className="text-sm font-medium text-emerald-700">達標 {wk.metDays}</div>
                        {wk.exceedDays > 0 && (
                          <div className="text-xs font-medium text-purple-600">超標 {wk.exceedDays}</div>
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

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-1 text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-medium ${color ?? "text-slate-800"}`}>{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}

function ProgressBar({
  label,
  current,
  target,
  color,
  fmt: fmtFn,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  fmt?: (v: number) => string;
}) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  const display = fmtFn ? fmtFn(current) : fmt(current);
  const targetDisplay = fmtFn ? fmtFn(target) : fmt(target);
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between text-[10px] text-slate-500">
        <span>{label}</span>
        <span className="font-medium">
          {display} / {targetDisplay}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtMd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}/${Number(m[3])}`;
}
