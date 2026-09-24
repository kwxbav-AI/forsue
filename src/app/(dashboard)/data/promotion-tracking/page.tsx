"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrackingRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  storeName: string | null;
  region: string | null;
  homeStoreId: string | null;
  currentGrade: string;
  targetGrade: string | null;
  hoursRequired: number | null;
  hoursCarryOver: number;
  carryOverDate: string | null;
  dispatchHours: number;
  examDeductions: number;
  totalHours: number;
  hoursRemaining: number | null;
  eligible: boolean | null;
  note: string | null;
};

type ExamRecord = {
  id: string;
  examDate: string;
  fromGrade: string;
  toGrade: string;
  hoursDeducted: number;
  result: string | null;
  note: string | null;
};

const GRADE_HOURS: Record<string, { target: string; hours: number }> = {
  "三級營業員": { target: "二級營業員", hours: 40 },
  "二級營業員": { target: "一級營業員", hours: 80 },
  "初階兼職": { target: "進階兼職", hours: 40 },
};

type SortKey = "storeName" | "employeeName" | "currentGrade" | "targetGrade" | "totalHours" | "hoursRequired" | "eligible";

function ProgressBar({ total, required }: { total: number; required: number }) {
  const pct = Math.min(100, Math.round((total / required) * 100));
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-400" : "bg-sky-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

function Badge({ eligible, targetGrade, hoursRequired }: { eligible: boolean | null; targetGrade: string | null; hoursRequired: number | null }) {
  if (targetGrade === null)
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">已達頂</span>;
  if (hoursRequired === null)
    return <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400">不追蹤</span>;
  if (eligible === true) return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">可報考</span>;
  return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-600">累積中</span>;
}

function ResultBadge({ result }: { result: string | null }) {
  if (result === "PASSED") return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">通過</span>;
  if (result === "FAILED") return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">未通過</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">待確認</span>;
}

export default function PromotionTrackingPage() {
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState<string>("");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("storeName");
  const [sortAsc, setSortAsc] = useState(true);
  const [filterStore, setFilterStore] = useState("");
  const [filterCurrentGrade, setFilterCurrentGrade] = useState("");
  const [filterTargetGrade, setFilterTargetGrade] = useState("");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  }

  function sortRows(arr: TrackingRow[]): TrackingRow[] {
    return [...arr].sort((a, b) => {
      let va: string | number | null;
      let vb: string | number | null;
      switch (sortKey) {
        case "storeName": va = a.storeName ?? "zzz"; vb = b.storeName ?? "zzz"; break;
        case "employeeName": va = a.employeeName; vb = b.employeeName; break;
        case "currentGrade": va = a.currentGrade; vb = b.currentGrade; break;
        case "targetGrade": va = a.targetGrade ?? "zzz"; vb = b.targetGrade ?? "zzz"; break;
        case "totalHours": va = a.totalHours; vb = b.totalHours; break;
        case "hoursRequired": va = a.hoursRequired ?? 999; vb = b.hoursRequired ?? 999; break;
        case "eligible": va = a.eligible === true ? 0 : a.eligible === false ? 1 : 2; vb = b.eligible === true ? 0 : b.eligible === false ? 1 : 2; break;
        default: return 0;
      }
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return sortAsc ? cmp : -cmp;
    });
  }

  function SortTh({ col, label, className }: { col: SortKey; label: string; className?: string }) {
    const active = sortKey === col;
    return (
      <th
        className={`px-3 py-2.5 cursor-pointer select-none hover:bg-slate-100 ${className ?? "text-left"}`}
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className="text-[10px] text-slate-300">
            {active ? (sortAsc ? "▲" : "▼") : "⇅"}
          </span>
        </span>
      </th>
    );
  }

  // Edit modal state
  const [editTarget, setEditTarget] = useState<TrackingRow | null>(null);
  const [editForm, setEditForm] = useState({
    currentGrade: "", targetGrade: "", hoursRequired: "", hoursCarryOver: "", carryOverDate: "", homeStoreId: "", note: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(row: TrackingRow) {
    setEditTarget(row);
    setEditForm({
      currentGrade: row.currentGrade,
      targetGrade: row.targetGrade ?? "",
      hoursRequired: row.hoursRequired !== null ? String(row.hoursRequired) : "",
      hoursCarryOver: String(row.hoursCarryOver),
      carryOverDate: row.carryOverDate ? new Date(row.carryOverDate).toISOString().slice(0, 10) : "",
      homeStoreId: row.homeStoreId ?? "",
      note: row.note ?? "",
    });
  }

  function onGradeChange(grade: string) {
    const GRADE_NEXT: Record<string, string> = {
      "新進營業員": "三級營業員", "三級營業員": "二級營業員", "二級營業員": "一級營業員",
      "兼職新人": "初階兼職", "初階兼職": "進階兼職",
      "副店長": "三級店長", "三級店長": "二級店長", "二級店長": "一級店長",
    };
    const GRADE_CROSS_HOURS: Record<string, number> = {
      "三級營業員": 40, "二級營業員": 80, "初階兼職": 40,
    };
    setEditForm((f) => ({
      ...f,
      currentGrade: grade,
      targetGrade: GRADE_NEXT[grade] ?? "",
      hoursRequired: GRADE_CROSS_HOURS[grade] !== undefined ? String(GRADE_CROSS_HOURS[grade]) : "",
    }));
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditSaving(true);
    const res = await fetch(`/api/promotion-tracking/${editTarget.employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentGrade: editForm.currentGrade,
        targetGrade: editForm.targetGrade || null,
        hoursRequired: editForm.hoursRequired !== "" ? Number(editForm.hoursRequired) : null,
        hoursCarryOver: Number(editForm.hoursCarryOver),
        carryOverDate: editForm.carryOverDate,
        homeStoreId: editForm.homeStoreId || null,
        note: editForm.note || null,
      }),
    });
    if (res.ok) { setEditTarget(null); load(); }
    else { const j = await res.json(); setMsg(`錯誤：${j.error}`); }
    setEditSaving(false);
  }

  async function deleteTracking(row: TrackingRow) {
    if (!confirm(`確定要刪除「${row.employeeName}」的追蹤紀錄？此操作無法復原。`)) return;
    const res = await fetch(`/api/promotion-tracking/${row.employeeId}`, { method: "DELETE" });
    if (res.ok) { setMsg(`已刪除 ${row.employeeName}`); load(); }
    else setMsg("刪除失敗");
  }

  // Dispatch modal state
  const [dispTarget, setDispTarget] = useState<TrackingRow | null>(null);
  const [dispDate, setDispDate] = useState("");
  const [dispStoreId, setDispStoreId] = useState("");
  const [dispHours, setDispHours] = useState("");
  const [dispRemark, setDispRemark] = useState("");
  const [dispSaving, setDispSaving] = useState(false);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/stores").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setStores(d.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
    }).catch(() => {});
  }, []);

  async function submitDispatch() {
    if (!dispTarget || !dispDate || !dispStoreId || !dispHours) return;
    setDispSaving(true);
    const res = await fetch("/api/promotion-tracking/dispatch-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: dispTarget.employeeId,
        workDate: dispDate,
        toStoreId: dispStoreId,
        actualHours: Number(dispHours),
        remark: dispRemark || null,
      }),
    });
    if (res.ok) {
      setMsg(`已記錄 ${dispTarget.employeeName} 的派遣時數`);
      setDispTarget(null);
      setDispDate(""); setDispStoreId(""); setDispHours(""); setDispRemark("");
      load();
    } else {
      const j = await res.json();
      setMsg(`錯誤：${j.error}`);
    }
    setDispSaving(false);
  }

  // Exam modal state
  const [examTarget, setExamTarget] = useState<TrackingRow | null>(null);
  const [examDate, setExamDate] = useState("");
  const [examResult, setExamResult] = useState<"" | "PASSED" | "FAILED">("");
  const [examNote, setExamNote] = useState("");
  const [examSaving, setExamSaving] = useState(false);

  // Exam history modal
  const [histTarget, setHistTarget] = useState<TrackingRow | null>(null);
  const [histRecords, setHistRecords] = useState<ExamRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (eligibleOnly) params.set("eligible", "true");
    const res = await fetch(`/api/promotion-tracking?${params}`);
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [region, eligibleOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitExam() {
    if (!examTarget || !examDate) return;
    setExamSaving(true);
    const gradeInfo = GRADE_HOURS[examTarget.currentGrade];
    const res = await fetch("/api/promotion-tracking/exam-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: examTarget.employeeId,
        examDate,
        fromGrade: examTarget.currentGrade,
        toGrade: examTarget.targetGrade ?? "",
        hoursDeducted: gradeInfo?.hours ?? 0,
        result: examResult || null,
        note: examNote || null,
      }),
    });
    if (res.ok) {
      setMsg(`已記錄 ${examTarget.employeeName} 的考核紀錄`);
      setExamTarget(null);
      setExamDate(""); setExamResult(""); setExamNote("");
      load();
    } else {
      const j = await res.json();
      setMsg(`錯誤：${j.error}`);
    }
    setExamSaving(false);
  }

  async function loadHistory(row: TrackingRow) {
    setHistTarget(row);
    setHistLoading(true);
    const res = await fetch(`/api/promotion-tracking/exam-records?employeeId=${row.employeeId}`);
    if (res.ok) setHistRecords(await res.json());
    setHistLoading(false);
  }

  async function updateResult(id: string, result: "PASSED" | "FAILED") {
    const res = await fetch(`/api/promotion-tracking/exam-records/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    if (res.ok) {
      if (histTarget) loadHistory(histTarget);
      load();
    }
  }

  async function deleteRecord(id: string) {
    if (!confirm("確定要刪除這筆考核紀錄？")) return;
    await fetch(`/api/promotion-tracking/exam-records/${id}`, { method: "DELETE" });
    if (histTarget) loadHistory(histTarget);
    load();
  }

  const filteredRows = rows.filter((r) => {
    if (filterStore && r.storeName !== filterStore) return false;
    if (filterCurrentGrade && r.currentGrade !== filterCurrentGrade) return false;
    if (filterTargetGrade) {
      if (filterTargetGrade === "__none__") { if (r.targetGrade !== null) return false; }
      else if (r.targetGrade !== filterTargetGrade) return false;
    }
    return true;
  });

  const storeOptions = [...new Set(rows.map((r) => r.storeName).filter(Boolean) as string[])].sort();
  const currentGradeOptions = [...new Set(rows.map((r) => r.currentGrade))].sort();
  const targetGradeOptions = [...new Set(rows.map((r) => r.targetGrade).filter(Boolean) as string[])].sort();

  const grouped = filteredRows.reduce<Record<string, TrackingRow[]>>((acc, r) => {
    const key = r.region ?? "其他";
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">跨店時數追蹤</h1>
          <p className="mt-0.5 text-sm text-slate-500">統計人員調度派遣時數，追蹤晉升所需跨店時數進度</p>
        </div>
        <Link href="/data" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          ← 資料區
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">全部區域</option>
          <option value="宜蘭區">宜蘭區</option>
          <option value="桃園區">桃園區</option>
        </select>
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">全部門市</option>
          {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterCurrentGrade}
          onChange={(e) => setFilterCurrentGrade(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">全部目前職等</option>
          {currentGradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={filterTargetGrade}
          onChange={(e) => setFilterTargetGrade(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">全部目標職等</option>
          {targetGradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="__none__">（已達頂）</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={eligibleOnly}
            onChange={(e) => setEligibleOnly(e.target.checked)}
            className="rounded"
          />
          只顯示可報考
        </label>
        {msg && (
          <span className="ml-2 text-sm text-emerald-600">{msg}</span>
        )}
      </div>

      {loading && <p className="text-sm text-slate-400">載入中…</p>}

      {/* Table per region */}
      {Object.entries(grouped).map(([rgn, rgnRows]) => (
        <div key={rgn} className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-slate-600 uppercase tracking-wide">{rgn}</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <SortTh col="storeName" label="門市" />
                  <SortTh col="employeeName" label="姓名" />
                  <SortTh col="currentGrade" label="目前職等" />
                  <SortTh col="targetGrade" label="目標職等" />
                  <SortTh col="totalHours" label="累積時數" className="text-right" />
                  <SortTh col="hoursRequired" label="門檻" className="text-right" />
                  <th className="px-3 py-2.5 text-left">進度</th>
                  <SortTh col="eligible" label="狀態" className="text-center" />
                  <th className="px-3 py-2.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(rgnRows).map((row) => (
                  <tr key={row.employeeId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{row.storeName ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.employeeName}</td>
                    <td className="px-3 py-2 text-slate-600">{row.currentGrade}</td>
                    <td className="px-3 py-2 text-slate-500">{row.targetGrade ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                      {row.totalHours.toFixed(1)}h
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {row.hoursRequired !== null ? `${row.hoursRequired}h` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.hoursRequired !== null ? (
                        <ProgressBar total={row.totalHours} required={row.hoursRequired} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge eligible={row.eligible} targetGrade={row.targetGrade} hoursRequired={row.hoursRequired} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => openEdit(row)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => { setDispTarget(row); setDispDate(""); setDispStoreId(""); setDispHours(""); setDispRemark(""); }}
                          className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100"
                        >
                          登錄時數
                        </button>
                        <button
                          onClick={() => loadHistory(row)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                        >
                          考核紀錄
                        </button>
                        {row.targetGrade && (
                          <button
                            onClick={() => { setExamTarget(row); setExamDate(""); setExamResult(""); setExamNote(""); }}
                            className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-100"
                          >
                            登錄考核
                          </button>
                        )}
                        <button
                          onClick={() => deleteTracking(row)}
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-slate-400">目前無資料。請確認已執行資料回填腳本。</p>
      )}

      {/* 登錄派遣時數 Modal */}
      {dispTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-slate-800">
              登錄派遣時數：{dispTarget.employeeName}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-slate-600">派遣日期 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={dispDate}
                  onChange={(e) => setDispDate(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">派往門市 <span className="text-red-500">*</span></label>
                <select
                  value={dispStoreId}
                  onChange={(e) => setDispStoreId(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="">請選擇門市</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">時數 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={dispHours}
                  onChange={(e) => setDispHours(e.target.value)}
                  placeholder="例：8"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">備註</label>
                <input
                  type="text"
                  value={dispRemark}
                  onChange={(e) => setDispRemark(e.target.value)}
                  placeholder="選填"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDispTarget(null)}
                className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={submitDispatch}
                disabled={!dispDate || !dispStoreId || !dispHours || dispSaving}
                className="rounded bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {dispSaving ? "儲存中…" : "確認儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-slate-800">
              編輯：{editTarget.employeeName}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-slate-600">所屬門市</label>
                <select
                  value={editForm.homeStoreId}
                  onChange={(e) => setEditForm((f) => ({ ...f, homeStoreId: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="">（自動推算）</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">目前職等</label>
                <select
                  value={editForm.currentGrade}
                  onChange={(e) => onGradeChange(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  {["新進營業員","三級營業員","二級營業員","一級營業員","兼職新人","初階兼職","進階兼職","副店長","三級店長","二級店長","一級店長"].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">目標職等</label>
                <input
                  type="text"
                  value={editForm.targetGrade}
                  onChange={(e) => setEditForm((f) => ({ ...f, targetGrade: e.target.value }))}
                  placeholder="（留空表示無目標）"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">跨店時數門檻（小時）</label>
                <input
                  type="number"
                  value={editForm.hoursRequired}
                  onChange={(e) => setEditForm((f) => ({ ...f, hoursRequired: e.target.value }))}
                  placeholder="（留空表示不需跨店時數）"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">歷史累計時數（CarryOver）</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.hoursCarryOver}
                  onChange={(e) => setEditForm((f) => ({ ...f, hoursCarryOver: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">累計基準日</label>
                <input
                  type="date"
                  value={editForm.carryOverDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, carryOverDate: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">備註</label>
                <input
                  type="text"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="選填"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setEditTarget(null)}
                className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {editSaving ? "儲存中…" : "確認儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 登錄考核 Modal */}
      {examTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-slate-800">
              登錄考核：{examTarget.employeeName}
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-slate-500">報考職等：</span>
                <span className="font-medium text-slate-700">{examTarget.currentGrade} → {examTarget.targetGrade}</span>
              </div>
              <div>
                <span className="text-slate-500">扣除時數：</span>
                <span className="font-medium text-slate-700">{GRADE_HOURS[examTarget.currentGrade]?.hours ?? 0} 小時</span>
                <span className="ml-1 text-xs text-slate-400">（無論通過與否均扣除）</span>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">考核日期 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-600">考核結果</label>
                <select
                  value={examResult}
                  onChange={(e) => setExamResult(e.target.value as "" | "PASSED" | "FAILED")}
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                >
                  <option value="">待確認（事後再填）</option>
                  <option value="PASSED">通過</option>
                  <option value="FAILED">未通過</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-slate-600">備註</label>
                <input
                  type="text"
                  value={examNote}
                  onChange={(e) => setExamNote(e.target.value)}
                  placeholder="選填"
                  className="w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setExamTarget(null)}
                className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={submitExam}
                disabled={!examDate || examSaving}
                className="rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {examSaving ? "儲存中…" : "確認儲存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 考核歷程 Modal */}
      {histTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-800">
                {histTarget.employeeName} 的考核紀錄
              </h3>
              <button onClick={() => setHistTarget(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            {histLoading ? (
              <p className="text-sm text-slate-400">載入中…</p>
            ) : histRecords.length === 0 ? (
              <p className="text-sm text-slate-400">尚無考核紀錄</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="pb-2 text-left">日期</th>
                    <th className="pb-2 text-left">報考</th>
                    <th className="pb-2 text-right">扣除</th>
                    <th className="pb-2 text-center">結果</th>
                    <th className="pb-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {histRecords.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-600">{r.examDate.slice(0, 10)}</td>
                      <td className="py-1.5 text-slate-600">{r.fromGrade} → {r.toGrade}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{Number(r.hoursDeducted).toFixed(1)}h</td>
                      <td className="py-1.5 text-center"><ResultBadge result={r.result} /></td>
                      <td className="py-1.5 text-center">
                        <div className="flex justify-center gap-1">
                          {r.result !== "PASSED" && (
                            <button onClick={() => updateResult(r.id, "PASSED")} className="text-xs text-emerald-600 hover:underline">通過</button>
                          )}
                          {r.result !== "FAILED" && (
                            <button onClick={() => updateResult(r.id, "FAILED")} className="text-xs text-red-500 hover:underline">未通過</button>
                          )}
                          <button onClick={() => deleteRecord(r.id)} className="text-xs text-slate-400 hover:text-red-500">刪除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setHistTarget(null)} className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
