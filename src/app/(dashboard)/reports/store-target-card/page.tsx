"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ApiWeek = {
  index: number;
  startYmd: string;
  endYmd: string;
  workingDays: number;
};

type ApiStoreRow = {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  byWeek: { metDays: number; exceedDays: number; total: number }[];
};

type ApiResponse = {
  month: string;
  startDate: string;
  endDate: string;
  weeks: ApiWeek[];
  stores: ApiStoreRow[];
};

function toMonthInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMdFromYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function buildWeekLabel(w: ApiWeek): string {
  return `${formatMdFromYmd(w.startYmd)}-${formatMdFromYmd(w.endYmd)}`;
}

function clampWeeksRemarks(weeks: ApiWeek[], prev: string[]): string[] {
  const next = weeks.map((_, i) => prev[i] ?? "");
  return next;
}

export default function StoreTargetCardReportPage() {
  const [month, setMonth] = useState(() => toMonthInputValue(new Date()));
  const [data, setData] = useState<ApiResponse | null>(null);
  const [remarksByWeek, setRemarksByWeek] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/reports/store-target-card?month=${encodeURIComponent(month)}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as ApiResponse | { error?: string } | null;
    if (!res.ok) {
      setData(null);
      setRemarksByWeek([]);
      setError((json as any)?.error || "載入失敗");
      setLoading(false);
      return;
    }
    const next = json as ApiResponse;
    setData(next);
    setRemarksByWeek((prev) => clampWeeksRemarks(next.weeks, prev));
    setLoading(false);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalsByWeek = useMemo(() => {
    const weeks = data?.weeks ?? [];
    const stores = data?.stores ?? [];
    const totals = weeks.map(() => ({ metDays: 0, exceedDays: 0, total: 0 }));
    for (const s of stores) {
      s.byWeek.forEach((w, i) => {
        if (!totals[i]) return;
        totals[i].metDays += w.metDays;
        totals[i].exceedDays += w.exceedDays;
        totals[i].total += w.total;
      });
    }
    return totals;
  }, [data]);

  const onCopy = useCallback(
    async (row: ApiStoreRow) => {
      const weeks = data?.weeks ?? [];
      const lines: string[] = [];
      lines.push(row.storeName);
      for (let i = 0; i < weeks.length; i++) {
        const w = weeks[i];
        const s = row.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
        const remark = (remarksByWeek[i] ?? "").trim();
        lines.push(
          `第${w.index}週 ${buildWeekLabel(w)} 工作日${w.workingDays} 達標${s.metDays} 超標${s.exceedDays} 小計${s.total}${remark ? ` 備註：${remark}` : ""}`
        );
      }
      await navigator.clipboard.writeText(lines.join("\n"));
      alert("已複製，可直接貼給門市參考");
    },
    [data?.weeks, remarksByWeek]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">門市達標（新的名片）</h1>
        <Link
          href="/reports"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回報表區
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">月份</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
          disabled={loading}
        >
          重新整理
        </button>
        {data ? (
          <span className="text-sm text-slate-500">
            區間 {formatMdFromYmd(data.startDate)}-{formatMdFromYmd(data.endDate)}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : !data || data.weeks.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此月份無可用資料（或全為週日）。
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">每週共用備註</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.weeks.map((w, i) => (
                <label key={w.index} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-600">
                    第{w.index}週（{buildWeekLabel(w)}）
                  </span>
                  <input
                    value={remarksByWeek[i] ?? ""}
                    onChange={(e) =>
                      setRemarksByWeek((prev) => {
                        const next = [...clampWeeksRemarks(data.weeks, prev)];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder="備註（可留空）"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              備註是每週共用一份（全門市同一套）；複製時會帶入對應週的備註。
            </p>
          </div>

          <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-[220px] min-w-[220px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    門市
                  </th>
                  {data.weeks.map((w) => (
                    <th key={w.index} className="min-w-[240px] px-4 py-2 text-left font-medium text-slate-700">
                      第{w.index}週 {buildWeekLabel(w)}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left font-medium text-slate-700">操作</th>
                </tr>
                <tr className="sticky top-[41px] z-10 border-b border-slate-200 bg-white">
                  <th className="sticky left-0 z-20 bg-white px-4 py-2 text-xs font-normal text-slate-500">
                    工作日/達標/超標/小計
                  </th>
                  {data.weeks.map((w) => (
                    <th key={w.index} className="px-4 py-2 text-xs font-normal text-slate-500">
                      工作日：{w.workingDays}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-xs font-normal text-slate-500" />
                </tr>
              </thead>
              <tbody>
                {data.stores.map((row) => (
                  <tr key={row.storeId} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[220px] min-w-[220px] bg-white px-4 py-2 font-medium text-slate-800">
                      <div className="flex items-center justify-between gap-2">
                        <span>{row.storeName}</span>
                        {row.storeCode ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600">
                            {row.storeCode}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    {data.weeks.map((w, i) => {
                      const s = row.byWeek[i] ?? { metDays: 0, exceedDays: 0, total: 0 };
                      return (
                        <td key={w.index} className="px-4 py-2 align-top">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                            <div>工作日</div>
                            <div className="text-right font-medium">{w.workingDays}</div>
                            <div className="text-green-700">達標</div>
                            <div className="text-right font-medium text-green-700">{s.metDays}</div>
                            <div className="text-sky-700">超標</div>
                            <div className="text-right font-medium text-sky-700">{s.exceedDays}</div>
                            <div className="text-slate-600">小計</div>
                            <div className="text-right font-semibold">{s.total}</div>
                            {remarksByWeek[i]?.trim() ? (
                              <div className="col-span-2 mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                                備註：{remarksByWeek[i].trim()}
                              </div>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => void onCopy(row)}
                      >
                        複製
                      </button>
                    </td>
                  </tr>
                ))}

                <tr className="bg-slate-50/60">
                  <td className="sticky left-0 z-[5] bg-slate-50/60 px-4 py-2 text-sm font-semibold text-slate-800">
                    全門市合計
                  </td>
                  {data.weeks.map((w, i) => (
                    <td key={w.index} className="px-4 py-2 text-xs text-slate-700">
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <div>工作日</div>
                        <div className="text-right font-medium">{w.workingDays}</div>
                        <div className="text-green-700">達標</div>
                        <div className="text-right font-medium text-green-700">{totalsByWeek[i]?.metDays ?? 0}</div>
                        <div className="text-sky-700">超標</div>
                        <div className="text-right font-medium text-sky-700">{totalsByWeek[i]?.exceedDays ?? 0}</div>
                        <div className="text-slate-600">小計</div>
                        <div className="text-right font-semibold">{totalsByWeek[i]?.total ?? 0}</div>
                      </div>
                    </td>
                  ))}
                  <td className="px-4 py-2 text-xs text-slate-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

