"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { formatLocalDateInput } from "@/lib/date";
import { OPS_COLORS, achievementToStatus, getStatusColor } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { StoreOpsStoreFilterSelect } from "@/components/operations/StoreOpsStoreFilterSelect";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";
import { appendStoreFilterToParams } from "@/lib/store-ops-retail-stores";
import * as XLSX from "xlsx";

type Journal = {
  id: string;
  reportDate: string;
  revenue: number | null;
  weather: string | null;
  handoverNote: string | null;
  feedback: string | null;
  restockDone: boolean;
  expiryDone: boolean;
  status: "DRAFT" | "SUBMITTED" | string;
  store: { storeName: string; region?: string | null };
  discountItems: { id: string; productName: string; amount: number; quantity: number; note: string | null }[];
};

type PerfBanner = {
  salesAmount: number;
  totalLaborHours: number;
  efficiencyRatio: number | null;
  targetMet: boolean | null;
};

function JournalPerfBanner({ storeId, date }: { storeId: string; date: string }) {
  const [perf, setPerf] = useState<PerfBanner | null>(null);

  useEffect(() => {
    if (!storeId || !date) return;
    void (async () => {
      const [perfRes, targetRes] = await Promise.all([
        fetch(`/api/operations/daily-store-performance?storeId=${storeId}&startDate=${date}&endDate=${date}`),
        fetch(
          `/api/operations/store-targets?storeId=${storeId}&year=${date.slice(0, 4)}&month=${Number(date.slice(5, 7))}`
        ),
      ]);
      const perfRows = perfRes.ok ? await perfRes.json() : [];
      const row = perfRows[0];
      if (!row) {
        setPerf(null);
        return;
      }
      const labor = Number(row.totalLaborHours) || 0;
      const sales = Number(row.salesAmount) || 0;
      const efficiency = labor > 0 ? Math.round(sales / labor) : null;
      let targetMet: boolean | null = null;
      if (targetRes.ok) {
        const targets = await targetRes.json();
        const t = targets[0];
        if (t?.salesTarget > 0) {
          const dailyTarget = Number(t.salesTarget) / 26;
          targetMet = sales >= dailyTarget;
        }
      }
      setPerf({ salesAmount: sales, totalLaborHours: labor, efficiencyRatio: efficiency, targetMet });
    })();
  }, [storeId, date]);

  if (!perf) return null;

  const statusTone = perf.targetMet == null ? "none" : perf.targetMet ? "met" : "unmet";
  const statusStyle = getStatusColor(statusTone);

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <div
        className="rounded-xl border px-4 py-3 text-sm"
        style={{ backgroundColor: OPS_COLORS.revenue.bg, borderColor: OPS_COLORS.revenue.border }}
      >
        <span style={{ color: OPS_COLORS.revenue.label }}>
          今日營業額 <strong style={{ color: OPS_COLORS.revenue.value }}>{perf.salesAmount.toLocaleString()}</strong> 元
        </span>
      </div>
      <div
        className="rounded-xl border px-4 py-3 text-sm"
        style={{ backgroundColor: OPS_COLORS.hours.bg, borderColor: OPS_COLORS.hours.border }}
      >
        <span style={{ color: OPS_COLORS.hours.label }}>
          工時 <strong style={{ color: OPS_COLORS.hours.value }}>{perf.totalLaborHours}</strong> hr · 工效比{" "}
          <strong style={{ color: OPS_COLORS.hours.value }}>
            {perf.efficiencyRatio != null ? perf.efficiencyRatio.toLocaleString() : "—"}
          </strong>{" "}
          元/hr
        </span>
      </div>
      {perf.targetMet != null ?
        <div
          className="rounded-xl border px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: statusStyle.bg, borderColor: statusStyle.border, color: statusStyle.value }}
        >
          {perf.targetMet ? "達標" : "未達標"}
        </div>
      : null}
    </div>
  );
}

type DiscountDraftItem = {
  key: string;
  productName: string;
  amount: number | "";
  quantity: number | "";
  note: string;
};

type MonthlyRow = {
  storeId: string;
  storeName: string;
  month: string;
  totalRevenue: number;
  avgDailyRevenue: number;
  customerFlow: number;
  submittedDays: number;
  totalBusinessDays: number;
  completionRate: number;
  restockDoneCount: number;
  restockRate: number;
  expiryDoneCount: number;
  expiryRate: number;
};

function monthInputPrevDefault(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(2, "0")}`;
}

function weatherEmoji(weather: string | null): string {
  if (!weather) return "";
  if (weather === "晴") return "☀️";
  if (weather === "陰") return "🌤️";
  if (weather === "雨") return "🌧️";
  if (weather === "颱風") return "🌀";
  return "🌡️";
}

function statusPill(status: string) {
  if (status === "SUBMITTED") {
    return { bg: "#EAF3DE", text: "#27500A", label: "已提交" };
  }
  if (status === "DRAFT") {
    return { bg: "#FAEEDA", text: "#633806", label: "草稿" };
  }
  return { bg: "#FCEBEB", text: "#791F1F", label: "未提交" };
}

function downloadXlsx(filename: string, rows: Record<string, unknown>[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export default function StoreOpsJournalPage() {
  const { ctx, defaultStoreId } = useStoreOpsContext();
  const today = formatLocalDateInput();
  const [tab, setTab] = useState<"journal" | "monthly">("journal");

  const [items, setItems] = useState<Journal[]>([]);
  const [storeFilter, setStoreFilter] = useState("all");
  const [reportDate, setReportDate] = useState(today);
  const [revenue, setRevenue] = useState<number | "">("");
  const [weather, setWeather] = useState<string>("晴");
  const [handoverNote, setHandoverNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [restockDone, setRestockDone] = useState(false);
  const [expiryDone, setExpiryDone] = useState(false);
  const [discountItems, setDiscountItems] = useState<DiscountDraftItem[]>([]);

  const [monthlyMonth, setMonthlyMonth] = useState(monthInputPrevDefault);
  const [monthlyStoreId, setMonthlyStoreId] = useState<string>("all");
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const isStaff = ctx?.roleKey === ROLE_KEYS.STORE_STAFF;
  const writeStoreId = isStaff ? defaultStoreId : "";

  const discountSubtotal = useMemo(() => {
    return discountItems.reduce((sum, i) => {
      const amt = typeof i.amount === "number" ? i.amount : 0;
      const qty = typeof i.quantity === "number" ? i.quantity : 0;
      return sum + amt * qty;
    }, 0);
  }, [discountItems]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (!isStaff) appendStoreFilterToParams(params, storeFilter);
    const res = await fetch(`/api/operations/store-ops/journal?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [storeFilter, isStaff]);

  useEffect(() => {
    if (tab !== "journal") return;
    void load();
  }, [load, tab]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    const params = new URLSearchParams({ month: monthlyMonth });
    const selected = isStaff ? writeStoreId : monthlyStoreId;
    if (selected && selected !== "all") params.set("storeId", selected);
    const res = await fetch(`/api/operations/store-ops/journal/monthly?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.items)) setMonthlyRows(data.items);
      else if (data && typeof data === "object") setMonthlyRows([data as MonthlyRow]);
      else setMonthlyRows([]);
    } else {
      setMonthlyRows([]);
    }
    setMonthlyLoading(false);
  }, [monthlyMonth, monthlyStoreId, isStaff, writeStoreId]);

  useEffect(() => {
    if (tab !== "monthly") return;
    void loadMonthly();
  }, [loadMonthly, tab]);

  function addDiscountItem() {
    setDiscountItems((prev) => [
      ...prev,
      { key: String(Date.now()) + Math.random().toString(16).slice(2), productName: "", amount: "", quantity: 1, note: "" },
    ]);
  }

  function removeDiscountItem(key: string) {
    setDiscountItems((prev) => prev.filter((x) => x.key !== key));
  }

  function updateDiscountItem(key: string, patch: Partial<DiscountDraftItem>) {
    setDiscountItems((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  }

  function resetDraft() {
    setReportDate(today);
    setRevenue("");
    setWeather("晴");
    setHandoverNote("");
    setFeedback("");
    setRestockDone(false);
    setExpiryDone(false);
    setDiscountItems([]);
  }

  async function save(status: "DRAFT" | "SUBMITTED") {
    if (!writeStoreId) return;
    await fetch("/api/operations/store-ops/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: writeStoreId,
        reportDate,
        revenue: typeof revenue === "number" ? revenue : null,
        weather,
        handoverNote,
        feedback,
        restockDone,
        expiryDone,
        discountItems: discountItems
          .filter((i) => i.productName.trim())
          .map((i) => ({
            productName: i.productName.trim(),
            amount: typeof i.amount === "number" ? i.amount : 0,
            quantity: typeof i.quantity === "number" ? i.quantity : 1,
            note: i.note.trim() || null,
          })),
        status,
      }),
    });
    if (status === "SUBMITTED") resetDraft();
    await load();
  }

  const exportJournal = useCallback(() => {
    const rows = items.flatMap((j) => {
      const base = {
        日期: j.reportDate.slice(0, 10),
        門市: j.store.storeName,
        狀態: j.status === "SUBMITTED" ? "已提交" : "草稿",
        天氣: j.weather ?? "",
        營業額: j.revenue ?? "",
        交接班人員: j.handoverNote ?? "",
        回饋事項: j.feedback ?? "",
        追貨完成: j.restockDone ? "是" : "否",
        即期品已處理: j.expiryDone ? "是" : "否",
      };
      if (!j.discountItems?.length) return [base];
      return j.discountItems.map((d, idx) => ({
        ...base,
        折扣序號: idx + 1,
        折扣商品: d.productName,
        折扣金額: d.amount,
        折扣數量: d.quantity,
        折扣備註: d.note ?? "",
      }));
    });
    downloadXlsx(`工作日誌-${formatLocalDateInput()}.xlsx`, rows, "日誌");
  }, [items]);

  const exportMonthly = useCallback(() => {
    downloadXlsx(
      `工作日誌月報-${monthlyMonth}.xlsx`,
      monthlyRows.map((r) => ({
        月份: r.month,
        門市: r.storeName,
        月總營業額: r.totalRevenue,
        日均營業額: r.avgDailyRevenue,
        來客數: r.customerFlow,
        已提交天數: r.submittedDays,
        營業天數: r.totalBusinessDays,
        完成率: r.completionRate,
        追貨完成率: r.restockRate,
        即期品處理率: r.expiryRate,
      })),
      "月報"
    );
  }, [monthlyMonth, monthlyRows]);

  return (
    <div className="p-6 max-w-5xl">
      <StoreOpsPageHeader
        title="工作日誌"
        subtitle={tab === "journal" ? "日誌填寫與查閱" : "月報統計"}
        action={
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: OPS_COLORS.revenue.border, color: OPS_COLORS.revenue.label }}
            onClick={() => (tab === "journal" ? exportJournal() : exportMonthly())}
          >
            {tab === "journal" ? "匯出 Excel" : "匯出月報"}
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: tab === "journal" ? OPS_COLORS.revenue.border : "#e2e8f0",
            backgroundColor: tab === "journal" ? OPS_COLORS.revenue.bg : "white",
            color: tab === "journal" ? OPS_COLORS.revenue.value : "#334155",
          }}
          onClick={() => setTab("journal")}
        >
          日誌
        </button>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: tab === "monthly" ? OPS_COLORS.revenue.border : "#e2e8f0",
            backgroundColor: tab === "monthly" ? OPS_COLORS.revenue.bg : "white",
            color: tab === "monthly" ? OPS_COLORS.revenue.value : "#334155",
          }}
          onClick={() => setTab("monthly")}
        >
          月報
        </button>
      </div>

      {tab === "journal" ? (
        <>
          {!isStaff ? (
            <div className="mb-4">
              <StoreOpsStoreFilterSelect
                mode="filter"
                stores={ctx?.stores ?? []}
                value={storeFilter}
                onChange={setStoreFilter}
              />
            </div>
          ) : null}

          {isStaff && writeStoreId ? <JournalPerfBanner storeId={writeStoreId} date={reportDate} /> : null}

          {isStaff && writeStoreId ? (
            <div
              className="mb-6 space-y-4 rounded-xl border bg-white p-4 shadow-sm"
              style={{ borderColor: OPS_COLORS.achievement.border }}
            >
              <p className="text-sm font-semibold" style={{ color: OPS_COLORS.achievement.value }}>
                新增日誌
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    日期
                  </p>
                  <input
                    type="date"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    營業額
                  </p>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={revenue}
                    onChange={(e) => setRevenue(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="例：120000"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    天氣
                  </p>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={weather}
                    onChange={(e) => setWeather(e.target.value)}
                  >
                    {["晴", "陰", "雨", "颱風", "其他"].map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    交接班人員
                  </p>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={handoverNote}
                    onChange={(e) => setHandoverNote(e.target.value)}
                    placeholder="例：王店長 → 李副店長"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <p className="text-xs" style={{ color: OPS_COLORS.achievement.label }}>
                    回饋事項
                  </p>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    rows={3}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="例：近期客訴、建議、需支援事項…"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm" style={{ color: OPS_COLORS.hours.label }}>
                  <input type="checkbox" checked={restockDone} onChange={(e) => setRestockDone(e.target.checked)} />
                  是否追貨完成
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: OPS_COLORS.hours.label }}>
                  <input type="checkbox" checked={expiryDone} onChange={(e) => setExpiryDone(e.target.checked)} />
                  即期品無回應是否已確實處理
                </label>
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: OPS_COLORS.hours.border }}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: OPS_COLORS.hours.value }}>
                    折扣商品
                  </p>
                  <p className="text-xs" style={{ color: OPS_COLORS.hours.label }}>
                    折扣小計：<strong style={{ color: OPS_COLORS.hours.value }}>{discountSubtotal.toLocaleString()}</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  {discountItems.map((d) => (
                    <div key={d.key} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                      <input
                        className="md:col-span-4 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="商品名稱（例：高山櫛瓜）"
                        value={d.productName}
                        onChange={(e) => updateDiscountItem(d.key, { productName: e.target.value })}
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="金額"
                        value={d.amount}
                        onChange={(e) =>
                          updateDiscountItem(d.key, { amount: e.target.value === "" ? "" : Number(e.target.value) })
                        }
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="數量"
                        value={d.quantity}
                        onChange={(e) =>
                          updateDiscountItem(d.key, { quantity: e.target.value === "" ? "" : Number(e.target.value) })
                        }
                      />
                      <input
                        className="md:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="備註（例：爛一根）"
                        value={d.note}
                        onChange={(e) => updateDiscountItem(d.key, { note: e.target.value })}
                      />
                      <button
                        type="button"
                        className="md:col-span-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        onClick={() => removeDiscountItem(d.key)}
                        title="刪除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  onClick={addDiscountItem}
                >
                  ＋ 添加折扣商品
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save("DRAFT")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
                >
                  儲存草稿
                </button>
                <button
                  type="button"
                  onClick={() => void save("SUBMITTED")}
                  className="rounded-lg px-4 py-2 text-sm text-white"
                  style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
                >
                  提交日誌
                </button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : (
            <ul className="space-y-3">
              {items.map((j) => {
                const pill = statusPill(j.status);
                const subtotal = (j.discountItems ?? []).reduce((sum, d) => sum + d.amount * d.quantity, 0);
                return (
                  <li
                    key={j.id}
                    className="rounded-xl border bg-white p-4 shadow-sm"
                    style={{ borderColor: OPS_COLORS.achievement.border }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: OPS_COLORS.achievement.value }}>
                          {j.store.storeName} · {j.reportDate.slice(0, 10)}{" "}
                          <span className="ml-1">{weatherEmoji(j.weather)}</span>
                        </p>
                        <p className="mt-1 text-sm" style={{ color: OPS_COLORS.revenue.label }}>
                          營業額{" "}
                          <strong style={{ color: OPS_COLORS.revenue.value }}>
                            {(j.revenue ?? 0).toLocaleString()}
                          </strong>
                        </p>
                      </div>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{ backgroundColor: pill.bg, color: pill.text }}
                      >
                        {pill.label}
                      </span>
                    </div>

                    {j.handoverNote ? (
                      <p className="mt-2 text-sm text-slate-700">交接班：{j.handoverNote}</p>
                    ) : null}
                    {j.feedback ? <p className="mt-1 text-sm text-slate-700">回饋：{j.feedback}</p> : null}

                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {j.restockDone ? (
                        <span style={{ color: OPS_COLORS.hours.value }}>追貨完成 ✓</span>
                      ) : (
                        <span className="text-slate-500">追貨未完成</span>
                      )}
                      {j.expiryDone ? (
                        <span style={{ color: OPS_COLORS.hours.value }}>即期品已處理 ✓</span>
                      ) : (
                        <span className="text-slate-500">即期品未處理</span>
                      )}
                    </div>

                    {j.discountItems?.length ? (
                      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: OPS_COLORS.hours.border }}>
                        <p className="text-sm font-semibold" style={{ color: OPS_COLORS.hours.value }}>
                          折扣商品（小計 {subtotal.toLocaleString()}）
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-700">
                          {j.discountItems.map((d) => (
                            <li key={d.id}>
                              {d.productName} · {d.amount} × {d.quantity}
                              {d.note ? `（${d.note}）` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}

      {tab === "monthly" ? (
        <>
          <div
            className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm"
            style={{ borderColor: OPS_COLORS.revenue.border }}
          >
            <div className="space-y-1">
              <p className="text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                選擇月份
              </p>
              <input
                type="month"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={monthlyMonth}
                onChange={(e) => setMonthlyMonth(e.target.value)}
              />
            </div>

            {!isStaff ? (
              <div className="space-y-1">
                <p className="text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                  選擇門市
                </p>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={monthlyStoreId}
                  onChange={(e) => setMonthlyStoreId(e.target.value)}
                >
                  <option value="all">全區</option>
                  {(ctx?.stores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.storeName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-white"
              style={{ backgroundColor: OPS_COLORS.revenue.chart }}
              onClick={() => void loadMonthly()}
            >
              查詢
            </button>
          </div>

          {monthlyLoading ? (
            <p className="text-sm text-slate-500">載入中…</p>
          ) : (
            <ul className="space-y-3">
              {monthlyRows.map((r) => {
                const completionStatus =
                  r.completionRate < 80 ? "unmet" : r.completionRate < 95 ? "none" : "met";
                const completionStyle = getStatusColor(completionStatus);
                const restockStyle = getStatusColor(achievementToStatus(r.restockRate));
                const expiryStyle = getStatusColor(achievementToStatus(r.expiryRate));
                return (
                  <li
                    key={r.storeId}
                    className="rounded-xl border bg-white p-4 shadow-sm"
                    style={{ borderColor: OPS_COLORS.revenue.border }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: OPS_COLORS.revenue.value }}>
                        {r.storeName}
                      </p>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold"
                        style={{ backgroundColor: OPS_COLORS.revenue.bg, color: OPS_COLORS.revenue.value }}
                      >
                        {r.month}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: OPS_COLORS.revenue.border }}>
                        <p className="text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                          總營業額
                        </p>
                        <p className="text-sm font-semibold" style={{ color: OPS_COLORS.revenue.value }}>
                          {r.totalRevenue.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: OPS_COLORS.revenue.border }}>
                        <p className="text-xs" style={{ color: OPS_COLORS.revenue.label }}>
                          日均營業額
                        </p>
                        <p className="text-sm font-semibold" style={{ color: OPS_COLORS.revenue.value }}>
                          {r.avgDailyRevenue.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: OPS_COLORS.customer.border }}>
                        <p className="text-xs" style={{ color: OPS_COLORS.customer.label }}>
                          來客數
                        </p>
                        <p className="text-sm font-semibold" style={{ color: OPS_COLORS.customer.value }}>
                          {r.customerFlow.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: completionStyle.border }}>
                        <p className="text-xs" style={{ color: completionStyle.label }}>
                          完成率
                        </p>
                        <p className="text-sm font-semibold" style={{ color: completionStyle.value }}>
                          {r.completionRate}%
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {r.submittedDays}/{r.totalBusinessDays} 天
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: restockStyle.border }}>
                        <p className="text-xs" style={{ color: restockStyle.label }}>
                          追貨完成率
                        </p>
                        <p className="text-sm font-semibold" style={{ color: restockStyle.value }}>
                          {r.restockRate}%
                        </p>
                      </div>
                      <div className="rounded-lg border px-3 py-2" style={{ borderColor: expiryStyle.border }}>
                        <p className="text-xs" style={{ color: expiryStyle.label }}>
                          即期品處理率
                        </p>
                        <p className="text-sm font-semibold" style={{ color: expiryStyle.value }}>
                          {r.expiryRate}%
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
