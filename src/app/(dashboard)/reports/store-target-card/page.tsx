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
  region: string | null;
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
  return `${formatMdFromYmd(w.startYmd)}–${formatMdFromYmd(w.endYmd)}`;
}

function clampWeeksRemarks(weeks: ApiWeek[], prev: string[]): string[] {
  return weeks.map((_, i) => prev[i] ?? "");
}

function RegionTag({ region }: { region: string | null }) {
  if (!region) return null;
  const isTaoyuan = region.includes("桃園");
  return (
    <span
      className={[
        "inline-block rounded px-1.5 py-px text-[10px] font-medium",
        isTaoyuan
          ? "bg-purple-50 text-purple-700"
          : "bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {region}
    </span>
  );
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
      setError((json as { error?: string })?.error ?? "載入失敗");
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

  const grandTotal = useMemo(() => {
    const stores = data?.stores ?? [];
    return stores.reduce(
      (acc, s) => {
        const stWd = (data?.weeks ?? []).reduce((a, _, i) => a + (data?.weeks[i]?.workingDays ?? 0), 0);
        s.byWeek.forEach((w) => {
          acc.metDays += w.metDays;
          acc.exceedDays += w.exceedDays;
          acc.total += w.total;
        });
        acc.workingDays += stWd;
        return acc;
      },
      { workingDays: 0, metDays: 0, exceedDays: 0, total: 0 }
    );
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
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-medium text-slate-800">門市達標</h1>
        {data && (
          <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-0.5 text-xs text-slate-500">
            {data.month}
          </span>
        )}
        <Link
          href="/reports"
          className="ml-auto rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
        >
          回報表區
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
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
          disabled={loading}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
        >
          重新整理
        </button>
        {data && (
          <span className="text-sm text-slate-400">
            區間 {formatMdFromYmd(data.startDate)}–{formatMdFromYmd(data.endDate)}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : !data || data.weeks.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          此月份無可用資料（或全為週日）。
        </p>
      ) : (
        <div className="space-y-4">
          {/* 每週共用備註 */}
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <p className="mb-2.5 text-xs text-slate-500">每週共用備註</p>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${data.weeks.length}, 1fr)` }}
            >
              {data.weeks.map((w, i) => (
                <label key={w.index} className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400">
                    第{w.index}週 {buildWeekLabel(w)}
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
                    className="rounded border border-slate-200 px-2 py-1 text-xs placeholder:text-slate-300"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              備註是每週共用一份（全門市同一套）；複製時會帶入對應週的備註。
            </p>
          </div>

          {/* 主表格 */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 72 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 52 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 60 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 56 }} />
                <col style={{ width: 56 }} />
                <col />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["區域", "店別", "週次", "日期", "工作日", "達標", "超標", "小計", "備註", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={[
                          "py-2 text-[11px] font-medium text-slate-500",
                          i < 2 || i === 8 ? "px-3 text-left" : "px-2 text-center",
                        ].join(" ")}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {data.stores.map((store) => {
                  const stPass = store.byWeek.reduce((a, w) => a + w.metDays, 0);
                  const stOver = store.byWeek.reduce((a, w) => a + w.exceedDays, 0);
                  const stWd = data.weeks.reduce((a, w) => a + w.workingDays, 0);

                  return (
                    <>
                      {store.byWeek.map((wk, wi) => {
                        const week = data.weeks[wi];
                        const isFirst = wi === 0;
                        const remark = (remarksByWeek[wi] ?? "").trim();
                        return (
                          <tr
                            key={`${store.storeId}-${wi}`}
                            className="border-b border-slate-100 hover:bg-slate-50/60"
                          >
                            <td className="px-3 py-2 align-middle">
                              {isFirst && <RegionTag region={store.region} />}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              {isFirst && (
                                <span className="font-medium text-slate-800">{store.storeName}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-middle text-xs text-slate-500">
                              W{week.index}
                            </td>
                            <td className="px-2 py-2 text-center align-middle text-xs text-slate-500">
                              {buildWeekLabel(week)}
                            </td>
                            <td className="px-2 py-2 text-center align-middle text-slate-500">
                              {week.workingDays}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              {wk.metDays > 0 ? (
                                <span className="font-medium text-emerald-700">{wk.metDays}</span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              {wk.exceedDays > 0 ? (
                                <span className="font-medium text-sky-700">{wk.exceedDays}</span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              {wk.total > 0 ? (
                                <span className="font-medium text-slate-700">{wk.total}</span>
                              ) : (
                                <span className="text-slate-300">0</span>
                              )}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              {remark && (
                                <span className="text-[11px] text-amber-600">{remark}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center align-middle">
                              {isFirst && (
                                <button
                                  type="button"
                                  onClick={() => void onCopy(store)}
                                  className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-300 hover:text-slate-700"
                                >
                                  複製
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {/* 門市月小計 */}
                      <tr className="border-b border-slate-200 bg-slate-50/70">
                        <td colSpan={4} className="px-3 py-1.5">
                          <span className="text-[11px] text-slate-400">
                            {store.storeName} 月小計
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs text-slate-400">{stWd}</td>
                        <td className="px-2 py-1.5 text-center text-xs font-medium text-emerald-700">
                          {stPass}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs font-medium text-sky-700">
                          {stOver}
                        </td>
                        <td className="px-2 py-1.5 text-center text-xs font-medium text-slate-700">
                          {stPass + stOver}
                        </td>
                        <td colSpan={2} />
                      </tr>

                      {/* 門市間分隔 */}
                      <tr>
                        <td colSpan={10} className="h-1 bg-slate-100" />
                      </tr>
                    </>
                  );
                })}

                {/* 月總計 */}
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-3 py-2.5">
                    <span className="text-xs font-medium text-slate-600">月總計</span>
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm font-medium text-slate-500">
                    {data.weeks.reduce((a, w) => a + w.workingDays, 0) * data.stores.length}
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm font-medium text-emerald-700">
                    {grandTotal.metDays}
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm font-medium text-sky-700">
                    {grandTotal.exceedDays}
                  </td>
                  <td className="px-2 py-2.5 text-center text-sm font-medium text-slate-700">
                    {grandTotal.total}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
