"use client";

import React, { useState, useEffect, useCallback } from "react";

// ─── 型別 ──────────────────────────────────────────────────────────────────────
interface DailyDetail {
  id: string;
  workDate: string;
  weekday: number;
  storeId: string;
  storeName: string;
  isTargetMet: boolean;
  isExceeded: boolean;
  efficiencyRatio: number;
  scheduledHours: number;
  actualWorkHours: number;
  calcHours: number;
  baseBonus: number;
  dailyBonus: number;
  dispatchNote: string | null;
}

interface BonusResult {
  id: string;
  yearMonth: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  storeName: string;
  position: string | null;
  totalCalcHours: number;
  targetBonus: number;
  operationsBonus: number;
  subtotalBonus: number;
  newHireRatio: number;
  isNewStoreGuarantee: boolean;
  guaranteeAmount: number | null;
  bonusMultiplier: number;
  accountabilityRatio: number;
  finalBonus: number;
  calculatedAt: string;
  dailyDetails: DailyDetail[];
}

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];
const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");
const fmt2 = (n: number) => n.toFixed(2);

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── 主頁面 ────────────────────────────────────────────────────────────────────
export default function BonusMonthlyPage() {
  const [yearMonth, setYearMonth] = useState(getCurrentYearMonth);
  const [results, setResults] = useState<BonusResult[]>([]);
  const [calculatedAt, setCalculatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRatio, setEditingRatio] = useState("");

  const fetchResults = useCallback(async (ym: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bonus/monthly?yearMonth=${ym}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "載入失敗");
      setResults(data.results ?? []);
      setCalculatedAt(data.calculatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults(yearMonth);
  }, [yearMonth, fetchResults]);

  const handleCalculate = async () => {
    if (!confirm(`確定要重新計算 ${yearMonth} 的績效獎金嗎？`)) return;
    setCalculating(true);
    setError(null);
    try {
      const res = await fetch("/api/bonus/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "計算失敗");
      await fetchResults(yearMonth);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveRatio = async (resultId: string) => {
    const ratio = parseFloat(editingRatio);
    if (isNaN(ratio) || ratio < 0 || ratio > 2) {
      alert("權責比例需在 0 ~ 2 之間");
      return;
    }
    try {
      const res = await fetch(`/api/bonus/monthly/${resultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountabilityRatio: ratio }),
      });
      if (!res.ok) throw new Error("儲存失敗");
      const updated = await res.json();
      setResults((prev) =>
        prev.map((r) =>
          r.id === resultId
            ? { ...r, accountabilityRatio: updated.accountabilityRatio, finalBonus: Number(updated.finalBonus) }
            : r
        )
      );
      setEditingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const handleExport = () => {
    window.location.href = `/api/bonus/export?yearMonth=${yearMonth}`;
  };

  // ── 統計卡片數值 ──
  const totalFinalBonus = results.reduce((s, r) => s + r.finalBonus, 0);
  const guaranteeCount = results.filter((r) => r.isNewStoreGuarantee).length;
  const newHireCount = results.filter((r) => r.newHireRatio < 1).length;

  return (
    <div className="space-y-4">
      {/* 標題列 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">績效獎金月報</h1>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {calculating ? "計算中…" : "重新計算"}
          </button>
          {results.length > 0 && (
            <button
              onClick={handleExport}
              className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              匯出 Excel
            </button>
          )}
        </div>
      </div>

      {calculatedAt && (
        <p className="text-xs text-slate-500">
          最後計算時間：{new Date(calculatedAt).toLocaleString("zh-TW")}
        </p>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 統計卡片 */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="計算人數" value={`${results.length} 人`} />
          <StatCard label="總獎金金額" value={`$${fmt(totalFinalBonus)}`} color="sky" />
          <StatCard label="新店保障人數" value={`${guaranteeCount} 人`} color={guaranteeCount > 0 ? "amber" : undefined} />
          <StatCard label="新人比例人數" value={`${newHireCount} 人`} color={newHireCount > 0 ? "orange" : undefined} />
        </div>
      )}

      {/* 主表格 */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">載入中…</div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center text-slate-400">
          {calculatedAt === null ? "尚未計算，請點擊「重新計算」" : "此月份無獎金資料"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="sticky top-14 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-2 text-left">員工編號</th>
                <th className="px-3 py-2 text-left">姓名</th>
                <th className="px-3 py-2 text-left">部門</th>
                <th className="px-3 py-2 text-left">職稱</th>
                <th className="px-3 py-2 text-right">計算工時</th>
                <th className="px-3 py-2 text-right">達標獎金</th>
                <th className="px-3 py-2 text-right">營運成果</th>
                <th className="px-3 py-2 text-right">小計</th>
                <th className="px-3 py-2 text-center">新人%</th>
                <th className="px-3 py-2 text-center">倍率</th>
                <th className="px-3 py-2 text-center">權責%</th>
                <th className="px-3 py-2 text-right font-semibold">最終獎金</th>
                <th className="px-3 py-2 text-center">備註</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {results.map((r) => (
                <React.Fragment key={r.id}>
                  <tr
                    className={`hover:bg-slate-50 ${expandedId === r.id ? "bg-sky-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.employeeCode}</td>
                    <td className="px-3 py-2 font-medium">{r.employeeName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.storeName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.position ?? "-"}</td>
                    <td className="px-3 py-2 text-right">{fmt2(r.totalCalcHours)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.targetBonus)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.operationsBonus)}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.subtotalBonus)}</td>
                    <td className="px-3 py-2 text-center">
                      {r.newHireRatio < 1 ? (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                          {Math.round(r.newHireRatio * 100)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">100%</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-medium ${r.bonusMultiplier === 0 ? "text-slate-400" : r.bonusMultiplier >= 1.6 ? "text-sky-700" : ""}`}>
                        {r.bonusMultiplier}×
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {editingId === r.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="2"
                            value={editingRatio}
                            onChange={(e) => setEditingRatio(e.target.value)}
                            className="w-16 rounded border border-slate-300 px-1 py-0.5 text-center text-xs"
                          />
                          <button
                            onClick={() => handleSaveRatio(r.id)}
                            className="text-xs text-sky-600 hover:underline"
                          >
                            存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-slate-400 hover:underline"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(r.id);
                            setEditingRatio(String(r.accountabilityRatio));
                          }}
                          className={`rounded px-1.5 py-0.5 text-xs hover:bg-slate-200 ${r.accountabilityRatio !== 1 ? "bg-yellow-100 font-medium text-yellow-700" : "text-slate-500"}`}
                        >
                          {Math.round(r.accountabilityRatio * 100)}%
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-800">
                      {r.isNewStoreGuarantee ? (
                        <span className="text-amber-600">⬆ {fmt(r.finalBonus)}</span>
                      ) : (
                        fmt(r.finalBonus)
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {r.isNewStoreGuarantee && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-700">保障</span>
                        )}
                        {r.newHireRatio < 1 && (
                          <span className="rounded bg-orange-100 px-1 py-0.5 text-orange-700">新人</span>
                        )}
                        {r.bonusMultiplier === 0 && (
                          <span className="rounded bg-slate-100 px-1 py-0.5 text-slate-500">不計</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                        className="text-xs text-sky-600 hover:underline whitespace-nowrap"
                      >
                        {expandedId === r.id ? "收起" : "明細"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr>
                      <td colSpan={14} className="bg-slate-50 px-4 py-3">
                        <DailyDetailTable details={r.dailyDetails} newHireRatio={r.newHireRatio} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── 子元件 ────────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "sky" | "amber" | "orange";
}) {
  const colorMap: Record<string, string> = {
    sky: "text-sky-700",
    amber: "text-amber-600",
    orange: "text-orange-600",
  };
  const colorCls = (color ? colorMap[color] : undefined) ?? "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${colorCls}`}>{value}</div>
    </div>
  );
}

function DailyDetailTable({ details, newHireRatio }: { details: DailyDetail[]; newHireRatio: number }) {
  if (details.length === 0) return <p className="text-xs text-slate-400">無每日明細</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="px-2 py-1 text-left">日期</th>
            <th className="px-2 py-1 text-left">星期</th>
            <th className="px-2 py-1 text-left">門市</th>
            <th className="px-2 py-1 text-center">達標</th>
            <th className="px-2 py-1 text-center">超標</th>
            <th className="px-2 py-1 text-right">工效比</th>
            <th className="px-2 py-1 text-right">表訂</th>
            <th className="px-2 py-1 text-right">實際</th>
            <th className="px-2 py-1 text-right">計算</th>
            <th className="px-2 py-1 text-right">當日獎金</th>
            <th className="px-2 py-1 text-left">說明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {details.map((d) => (
            <tr key={d.id} className={d.dailyBonus > 0 ? "" : "text-slate-400"}>
              <td className="px-2 py-1">{d.workDate}</td>
              <td className="px-2 py-1">{WEEKDAY_LABEL[d.weekday]}</td>
              <td className="px-2 py-1">{d.storeName}</td>
              <td className="px-2 py-1 text-center">
                {d.isTargetMet ? <span className="text-green-600">✓</span> : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-2 py-1 text-center">
                {d.isExceeded ? <span className="text-sky-600 font-bold">超標</span> : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-2 py-1 text-right">{d.efficiencyRatio.toFixed(0)}</td>
              <td className="px-2 py-1 text-right">{d.scheduledHours}h</td>
              <td className="px-2 py-1 text-right">{d.actualWorkHours.toFixed(2)}h</td>
              <td className="px-2 py-1 text-right">{d.calcHours}h</td>
              <td className="px-2 py-1 text-right font-medium">{d.dailyBonus > 0 ? Math.round(d.dailyBonus * newHireRatio).toLocaleString("zh-TW") : "—"}</td>
              <td className="px-2 py-1 text-slate-500">
                {d.dispatchNote && (
                  <span className="rounded bg-blue-100 px-1 py-0.5 text-blue-700">{d.dispatchNote}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
