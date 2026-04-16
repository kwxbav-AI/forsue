"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";
import { PendingDeletionPanel } from "@/components/pending-deletion-panel";

type Store = {
  id: string;
  code: string | null;
  name: string;
  department?: string | null;
  isActive?: boolean;
};

type Row = {
  id: string;
  workDate: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  reason: string;
  hours: number;
  note: string | null;
};

const REASON_OPTIONS = [
  { value: "EXPIRY", label: "效期" },
  { value: "CLEANING", label: "清掃" },
  { value: "INVENTORY_REGISTRATION", label: "現貨文登記" },
  { value: "OTHER", label: "其他" },
];

const REASON_LABELS: Record<string, string> = {
  EXPIRY: "效期",
  CLEANING: "清掃",
  INVENTORY_REGISTRATION: "現貨文登記",
  OTHER: "其他",
};

export default function StoreHourDeductionsPage() {
  const [startDate, setStartDate] = useState(() => formatLocalDateInput());
  const [endDate, setEndDate] = useState(() => formatLocalDateInput());
  const [list, setList] = useState<Row[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [modal, setModal] = useState<"add" | null>(null);
  const [perm, setPerm] = useState({ canReadPending: false, canApprove: false });
  const [pendingRefresh, setPendingRefresh] = useState(0);
  const [storeSearch, setStoreSearch] = useState("");
  const [storeOpen, setStoreOpen] = useState(false);
  const [form, setForm] = useState({
    workDate: formatLocalDateInput(),
    storeId: "",
    reason: "EXPIRY" as string,
    hours: "",
    note: "",
  });

  const fetchList = () => {
    setLoading(true);
    fetch(
      `/api/store-hour-deductions?startDate=${startDate}&endDate=${endDate}`
    )
      .then((r) => r.json())
      .then((data: Row[]) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, [startDate, endDate]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setPerm({
          canReadPending: Boolean(d?.user?.canReadPendingStoreHourDeductions),
          canApprove: Boolean(d?.user?.canApproveDeleteStoreHourDeductions),
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onPending = () => {
      fetchList();
      setPendingRefresh((k) => k + 1);
    };
    window.addEventListener("pending-deletions-changed", onPending);
    return () => window.removeEventListener("pending-deletions-changed", onPending);
  }, [startDate, endDate]);

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d: Store[]) => setStores(Array.isArray(d) ? d : []))
      .catch(() => setStores([]));
  }, []);

  const activeStores = useMemo(
    () => stores.filter((s) => s.isActive !== false),
    [stores]
  );
  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return activeStores;
    const q = storeSearch.trim().toLowerCase();
    return activeStores.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q)
    );
  }, [activeStores, storeSearch]);

  const selectedStoreName = useMemo(() => {
    if (!form.storeId) return "";
    return stores.find((s) => s.id === form.storeId)?.name ?? "";
  }, [stores, form.storeId]);

  async function submit() {
    setMessage(null);
    const hoursNum = parseFloat(form.hours);
    if (!Number.isFinite(hoursNum) || hoursNum < 0) {
      setMessage({ type: "err", text: "請輸入有效的時數（≥ 0）" });
      return;
    }
    if (!form.storeId) {
      setMessage({ type: "err", text: "請選擇門市" });
      return;
    }
    const res = await fetch("/api/store-hour-deductions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workDate: form.workDate,
        storeId: form.storeId,
        reason: form.reason,
        hours: hoursNum,
        note: form.note.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ type: "err", text: data.error || "新增失敗" });
      return;
    }
    setMessage({ type: "ok", text: "已新增，該日總工時已重算" });
    setForm({
      workDate: form.workDate,
      storeId: "",
      reason: "EXPIRY",
      hours: "",
      note: "",
    });
    setStoreSearch("");
    setModal(null);
    fetchList();
  }

  async function deleteRow(id: string) {
    if (!confirm("確定刪除此筆？")) return;
    const res = await fetch(`/api/store-hour-deductions/${id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 202) {
      setMessage({ type: "ok", text: data.message || "已送出刪除申請，待核准後生效" });
      setPendingRefresh((k) => k + 1);
      fetchList();
      return;
    }
    if (!res.ok) {
      setMessage({ type: "err", text: data.error || "刪除失敗" });
      return;
    }
    setMessage({ type: "ok", text: "已刪除，該日總工時已重算" });
    setPendingRefresh((k) => k + 1);
    fetchList();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">效期/清掃 工時</h1>
        <Link
          href="/workhour-related"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回工時異動相關
        </Link>
      </div>

      <PendingDeletionPanel
        segment="store-hour-deductions"
        canRead={perm.canReadPending}
        canApprove={perm.canApprove}
        title="待審刪除申請（效期/清掃工時）"
        refreshKey={pendingRefresh}
      />

      <p className="mb-4 text-sm text-slate-500">
        填寫的時數會從「每日工效比」該門市當日的總工時中扣除。
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setModal("add");
            setStoreSearch("");
            setForm({
              workDate: formatLocalDateInput(),
              storeId: "",
              reason: "EXPIRY",
              hours: "",
              note: "",
            });
          }}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
        >
          新增一筆
        </button>
        {message && (
          <span
            className={
              message.type === "ok" ? "text-sm text-green-600" : "text-sm text-red-600"
            }
          >
            {message.text}
          </span>
        )}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm text-slate-600">查詢區間</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <span className="text-slate-500">～</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        ) : list.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">此區間無資料</p>
        ) : (
          <div className="relative max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-20 w-[120px] min-w-[120px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    日期
                  </th>
                  <th className="sticky left-[120px] z-20 w-[160px] min-w-[160px] bg-slate-50 px-4 py-2 text-left font-medium text-slate-700">
                    門市
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">原因</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-700">時數</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">備註</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-[5] w-[120px] min-w-[120px] bg-white px-4 py-2">
                      {r.workDate}
                    </td>
                    <td className="sticky left-[120px] z-[5] w-[160px] min-w-[160px] bg-white px-4 py-2">
                      {r.storeName}
                    </td>
                    <td className="px-4 py-2">{REASON_LABELS[r.reason] ?? r.reason}</td>
                    <td className="px-4 py-2 text-right">{r.hours}</td>
                    <td className="px-4 py-2 text-slate-600">{r.note ?? "—"}</td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => deleteRow(r.id)}
                        className="text-red-600 hover:underline"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === "add" && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-medium text-slate-800">新增效期/清掃 工時</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-600">日期</span>
                <input
                  type="date"
                  value={form.workDate}
                  onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">門市</span>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={storeOpen ? storeSearch : selectedStoreName}
                    onChange={(e) => {
                      setStoreSearch(e.target.value);
                      setStoreOpen(true);
                      if (!e.target.value) setForm((f) => ({ ...f, storeId: "" }));
                    }}
                    onFocus={() => {
                      setStoreOpen(true);
                      if (form.storeId) setStoreSearch(selectedStoreName);
                    }}
                    onBlur={() => setTimeout(() => setStoreOpen(false), 180)}
                    placeholder="請搜尋或選擇門市"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  {storeOpen && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow">
                      {filteredStores.length === 0 ? (
                        <li className="px-2 py-2 text-sm text-slate-500">無符合的門市</li>
                      ) : (
                        filteredStores.map((s) => (
                          <li
                            key={s.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm((f) => ({ ...f, storeId: s.id }));
                              setStoreSearch("");
                              setStoreOpen(false);
                            }}
                            className="cursor-pointer px-2 py-1.5 text-sm hover:bg-slate-100"
                          >
                            {s.name}
                            {s.department ? `（${s.department}）` : ""}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">原因</span>
                <select
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">時數</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                  placeholder="扣除時數"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">備註（選填）</span>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
