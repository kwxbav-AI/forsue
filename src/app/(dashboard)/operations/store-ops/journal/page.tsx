"use client";

import { useCallback, useEffect, useState } from "react";
import { ROLE_KEYS } from "@/lib/roles";
import { formatLocalDateInput } from "@/lib/date";
import { OPS_COLORS, getStatusColor } from "@/lib/ops-color-tokens";
import { StoreOpsPageHeader } from "@/components/operations/store-ops-page-header";
import { StoreOpsStoreFilterSelect } from "@/components/operations/StoreOpsStoreFilterSelect";
import { useStoreOpsContext } from "@/hooks/use-store-ops-context";
import { appendStoreFilterToParams } from "@/lib/store-ops-retail-stores";

type Journal = {
  id: string;
  reportDate: string;
  mainWork: string | null;
  anomaly: string | null;
  status: string;
  store: { storeName: string };
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

export default function StoreOpsJournalPage() {
  const { ctx, defaultStoreId } = useStoreOpsContext();
  const today = formatLocalDateInput();
  const [items, setItems] = useState<Journal[]>([]);
  const [storeFilter, setStoreFilter] = useState("all");
  const [reportDate, setReportDate] = useState(today);
  const [mainWork, setMainWork] = useState("");
  const [anomaly, setAnomaly] = useState("");
  const [loading, setLoading] = useState(true);

  const isStaff = ctx?.roleKey === ROLE_KEYS.STORE_STAFF;
  const writeStoreId = isStaff ? defaultStoreId : "";

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ date: reportDate });
    if (!isStaff) appendStoreFilterToParams(params, storeFilter);
    const res = await fetch(`/api/operations/store-ops/journal?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
    setLoading(false);
  }, [reportDate, storeFilter, isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(status: "DRAFT" | "SUBMITTED") {
    if (!writeStoreId) return;
    await fetch("/api/operations/store-ops/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: writeStoreId,
        reportDate,
        mainWork,
        anomaly,
        status,
      }),
    });
    await load();
  }

  return (
    <div className="p-6 max-w-3xl">
      <StoreOpsPageHeader title="工作日誌" subtitle={`日期：${reportDate}`} />
      {!isStaff ?
        <div className="mb-4">
          <StoreOpsStoreFilterSelect
            mode="filter"
            stores={ctx?.stores ?? []}
            value={storeFilter}
            onChange={setStoreFilter}
          />
        </div>
      : null}
      {isStaff && writeStoreId ?
        <>
          <JournalPerfBanner storeId={writeStoreId} date={reportDate} />
          <div
            className="mb-6 space-y-3 rounded-xl border bg-white p-4 shadow-sm"
            style={{ borderColor: OPS_COLORS.achievement.border }}
          >
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              placeholder="今日主要工作"
              value={mainWork}
              onChange={(e) => setMainWork(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={2}
              placeholder="異常事項"
              value={anomaly}
              onChange={(e) => setAnomaly(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save("DRAFT")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                暫存
              </button>
              <button
                type="button"
                onClick={() => void save("SUBMITTED")}
                className="rounded-lg px-4 py-2 text-sm text-white"
                style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
              >
                提交
              </button>
            </div>
          </div>
        </>
      : null}
      {loading ?
        <p className="text-sm text-slate-500">載入中…</p>
      : <ul className="space-y-2">
          {items.map((j) => (
            <li
              key={j.id}
              className="rounded-xl border bg-white px-4 py-3 shadow-sm"
              style={{ borderColor: OPS_COLORS.achievement.border }}
            >
              <p className="font-medium" style={{ color: OPS_COLORS.achievement.value }}>
                {j.store.storeName} · {j.reportDate.slice(0, 10)} · {j.status}
              </p>
              {j.mainWork ?
                <p className="mt-1 text-sm text-slate-600">{j.mainWork}</p>
              : null}
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
