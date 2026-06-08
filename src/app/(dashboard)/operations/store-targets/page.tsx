"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Pencil, Upload } from "lucide-react";

type StoreTarget = {
  id: string;
  storeId: string;
  storeName: string | null;
  region: string | null;
  year: number;
  month: number;
  salesTarget: number;
  laborHourTarget: number;
  rplhTarget: number | null;
  note: string | null;
};

type ImportResult = {
  ok: boolean;
  message?: string;
  upserted?: number;
  skipped?: number;
  matchedStores?: number;
  unmatchedStores?: string[];
  warnings?: string[];
  error?: string;
};

type YearStoreRow = {
  storeId: string;
  storeName: string;
  region: string;
  months: Map<
    number,
    { salesTarget: number; laborHourTarget: number; rplhTarget: number | null; id: string }
  >;
};

function buildYearMatrix(list: StoreTarget[]): YearStoreRow[] {
  const byStore = new Map<string, YearStoreRow>();
  for (const r of list) {
    let row = byStore.get(r.storeId);
    if (!row) {
      row = {
        storeId: r.storeId,
        storeName: r.storeName ?? r.storeId,
        region: r.region ?? "",
        months: new Map(),
      };
      byStore.set(r.storeId, row);
    }
    row.months.set(r.month, {
      salesTarget: r.salesTarget,
      laborHourTarget: r.laborHourTarget,
      rplhTarget: r.rplhTarget,
      id: r.id,
    });
  }
  return [...byStore.values()].sort((a, b) =>
    a.storeName.localeCompare(b.storeName, "zh-Hant")
  );
}

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function StoreTargetsPage() {
  const [list, setList] = useState<StoreTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [filterYear, setFilterYear] = useState(2026);
  const [filterMonth, setFilterMonth] = useState<number | "all">("all");
  const [importYear, setImportYear] = useState(2026);
  const [editing, setEditing] = useState<StoreTarget | null>(null);
  const [editForm, setEditForm] = useState({
    salesTarget: "",
    laborHourTarget: "",
    note: "",
  });
  const salesFileInputRef = useRef<HTMLInputElement>(null);
  const targetFileInputRef = useRef<HTMLInputElement>(null);

  const yearMatrix = useMemo(() => buildYearMatrix(list), [list]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(filterYear) });
    if (filterMonth !== "all") params.set("month", String(filterMonth));
    const res = await fetch(`/api/operations/store-targets?${params}`);
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, [filterYear, filterMonth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncStores() {
    setSyncing(true);
    setMessage(null);
    const res = await fetch("/api/operations/stores/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    if (!res.ok) {
      setMessage(data.error || "同步門市失敗");
      return;
    }
    setMessage(
      `已對應 ${data.matchedPerformance ?? 0} 間（新建 ${data.created ?? 0}、更新 ${data.updated ?? 0}）` +
        (data.skippedNoPerformance > 0 ?
          `；${data.skippedNoPerformance} 個 catalog 槽位尚無績效門市主檔`
        : "")
    );
  }

  async function handleImport() {
    const salesFile = salesFileInputRef.current?.files?.[0];
    const targetFile = targetFileInputRef.current?.files?.[0];
    if (!salesFile) {
      setMessage("請選擇「月業績目標」Excel 檔案");
      return;
    }
    if (!targetFile) {
      setMessage("請選擇「目標工時（依人力計算）」Excel 檔案");
      return;
    }

    setImporting(true);
    setMessage(null);
    setImportResult(null);

    const form = new FormData();
    form.append("salesFile", salesFile);
    form.append("targetFile", targetFile);
    form.append("year", String(importYear));

    const res = await fetch("/api/operations/store-targets/import", {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as ImportResult;
    setImporting(false);

    if (!res.ok) {
      setMessage(data.error || "匯入失敗");
      return;
    }

    setImportResult(data);
    setFilterYear(importYear);
    setFilterMonth("all");
    setMessage(data.message ?? "匯入完成");
    if (salesFileInputRef.current) salesFileInputRef.current.value = "";
    if (targetFileInputRef.current) targetFileInputRef.current.value = "";
    void refresh();
  }

  function startEdit(row: StoreTarget) {
    setEditing(row);
    setEditForm({
      salesTarget: String(row.salesTarget),
      laborHourTarget: String(row.laborHourTarget),
      note: row.note ?? "",
    });
    setMessage(null);
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const salesTarget = Number(editForm.salesTarget);
    const laborHourTarget = Number(editForm.laborHourTarget);
    if (!salesTarget || salesTarget <= 0 || !laborHourTarget || laborHourTarget <= 0) {
      setMessage("請輸入有效的業績與工時目標");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/operations/store-targets/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salesTarget,
        laborHourTarget,
        note: editForm.note || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "儲存失敗");
      return;
    }
    setMessage("已更新目標");
    setEditing(null);
    void refresh();
  }

  async function remove(id: string) {
    if (!confirm("確定要刪除此目標設定？")) return;
    const res = await fetch(`/api/operations/store-targets/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "刪除失敗");
      return;
    }
    if (editing?.id === id) setEditing(null);
    void refresh();
  }

  const previewRplh =
    editForm.salesTarget && editForm.laborHourTarget
      ? (Number(editForm.salesTarget) / Number(editForm.laborHourTarget)).toFixed(2)
      : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">門市目標設定</h1>
          <p className="mt-1 text-sm text-slate-500">
            同時上傳月業績目標與依人力計算工時兩份 Excel，合併寫入各月業績與工時目標。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void syncStores()}
            disabled={syncing}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing ? "同步中…" : "同步績效門市"}
          </button>
          <Link
            href="/operations/dashboard"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            營運總覽
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-sky-100 bg-sky-50/40 p-5">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-800">
          <FileSpreadsheet className="h-5 w-5 text-sky-600" />
          Excel 批次匯入
        </h2>
        <ul className="mb-4 list-disc pl-5 text-sm text-slate-600 space-y-1">
          <li>
            <strong>月業績目標</strong>：A 區域、B 門市、C～N 欄 <code>YYYY-MM</code> 各月業績
          </li>
          <li>
            <strong>依人力計算</strong>：A 區域、B 門市、H 週一～五預估工時/日、I 週六預估工時（正兼職排定後的每日工時）
          </li>
          <li>
            各月目標工時 = H × 當月平日工作天 + I × 當月週六工作天；月業績取自月業績檔；RPLH = 月業績 ÷ 月工時
          </li>
          <li>該月業績或工時為 0 的月份略過；匯入會覆寫該年度已對應門市全部月目標</li>
        </ul>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <label className="text-sm block">
            <span className="text-slate-600">目標年度</span>
            <input
              type="number"
              value={importYear}
              onChange={(e) => setImportYear(Number(e.target.value))}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
            />
          </label>
          <label className="text-sm block">
            <span className="text-slate-600">月業績目標 .xlsx</span>
            <input
              ref={salesFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="mt-1 block w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white file:text-sm"
            />
          </label>
          <label className="text-sm block">
            <span className="text-slate-600">目標工時（依人力計算）.xlsx</span>
            <input
              ref={targetFileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="mt-1 block w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white file:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing}
            className="flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Upload className={`h-4 w-4 ${importing ? "animate-pulse" : ""}`} />
            {importing ? "匯入中…" : "開始匯入"}
          </button>
        </div>

        {importResult?.ok ?
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p>
              成功寫入 <strong>{importResult.upserted}</strong> 筆；
              對應 <strong>{importResult.matchedStores}</strong> 間門市
              {importResult.skipped ? `；略過 ${importResult.skipped} 筆` : ""}
            </p>
            {importResult.unmatchedStores?.length ?
              <p className="mt-1 text-amber-800">
                無法對應：{importResult.unmatchedStores.join("、")}
              </p>
            : null}
            {importResult.warnings?.length ?
              <details className="mt-2">
                <summary className="cursor-pointer">匯入提示</summary>
                <ul className="mt-1 max-h-32 overflow-auto list-disc pl-4 text-xs">
                  {importResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            : null}
          </div>
        : null}
      </div>

      {editing ?
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-800">
            <Pencil className="h-4 w-4" />
            編輯 {editing.storeName} — {editing.year}/{editing.month}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="text-slate-600">月業績目標</span>
              <input
                type="number"
                value={editForm.salesTarget}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, salesTarget: e.target.value }))
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">月工時目標</span>
              <input
                type="number"
                value={editForm.laborHourTarget}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, laborHourTarget: e.target.value }))
                }
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="text-sm">
              <span className="text-slate-600">RPLH（預覽）</span>
              <input
                readOnly
                value={previewRplh ?? ""}
                className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-slate-600">備註</span>
              <input
                value={editForm.note}
                onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void saveEdit()}
              disabled={saving}
              className="rounded bg-sky-600 px-4 py-1.5 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "儲存中…" : "儲存"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-white"
            >
              取消
            </button>
          </div>
        </div>
      : null}

      {message ?
        <p
          className={`mb-4 text-sm ${message.includes("失敗") ? "text-red-600" : "text-slate-700"}`}
        >
          {message}
        </p>
      : null}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-slate-600">檢視年份</span>
          <input
            type="number"
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="mt-1 block rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600">檢視月份</span>
          <select
            value={filterMonth === "all" ? "all" : String(filterMonth)}
            onChange={(e) => {
              const v = e.target.value;
              setFilterMonth(v === "all" ? "all" : Number(v));
            }}
            className="mt-1 block rounded border border-slate-300 px-2 py-1.5 min-w-[100px]"
          >
            <option value="all">全年</option>
            {MONTH_LABELS.map((m) => (
              <option key={m} value={m}>
                {m} 月
              </option>
            ))}
          </select>
        </label>
        {filterMonth === "all" && list.length > 0 ?
          <p className="text-sm text-slate-500 pb-1">
            共 {yearMatrix.length} 間門市、{list.length} 筆月目標
          </p>
        : null}
      </div>

      <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
        {loading ?
          <p className="p-4 text-sm text-slate-500">載入中…</p>
        : list.length === 0 ?
          <p className="p-4 text-sm text-slate-500">尚無目標資料，請先匯入 Excel。</p>
        : filterMonth === "all" ?
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-2 py-2 sticky left-0 bg-slate-50 z-10">門市</th>
                <th className="px-2 py-2">區域</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="px-2 py-2 text-right whitespace-nowrap">
                    {m}月
                    <span className="block font-normal text-slate-400">業績/工時</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearMatrix.map((row) => (
                <tr key={row.storeId} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 font-medium sticky left-0 bg-white z-10">
                    {row.storeName}
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{row.region || "-"}</td>
                  {MONTH_LABELS.map((m) => {
                    const cell = row.months.get(m);
                    return (
                      <td
                        key={m}
                        className="px-2 py-1.5 text-right align-top cursor-pointer hover:bg-sky-50"
                        onClick={() => {
                          if (!cell) return;
                          const full = list.find((x) => x.id === cell.id);
                          if (full) startEdit(full);
                        }}
                        title={cell ? "點擊編輯" : undefined}
                      >
                        {cell ?
                          <>
                            <div>{Math.round(cell.salesTarget).toLocaleString()}</div>
                            <div className="text-slate-400">{cell.laborHourTarget}h</div>
                          </>
                        : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        : <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-2">門市</th>
                <th className="px-3 py-2">區域</th>
                <th className="px-3 py-2">年月</th>
                <th className="px-3 py-2 text-right">業績目標</th>
                <th className="px-3 py-2 text-right">工時目標</th>
                <th className="px-3 py-2 text-right">RPLH</th>
                <th className="px-3 py-2">備註</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">{row.storeName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.region ?? "-"}</td>
                  <td className="px-3 py-2">
                    {row.year}/{row.month}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.salesTarget.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{row.laborHourTarget}</td>
                  <td className="px-3 py-2 text-right">
                    {row.rplhTarget != null ? row.rplhTarget.toFixed(2) : "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-[200px] truncate">
                    {row.note ?? ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="mr-2 text-sky-600 hover:underline"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(row.id)}
                      className="text-red-600 hover:underline"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </div>
  );
}
