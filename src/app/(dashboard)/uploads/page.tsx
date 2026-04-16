"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const FILE_TYPES = [
  { key: "ATTENDANCE", label: "人員出勤表", api: "/api/uploads/attendance" },
  // 調度改為表單填報（不再上傳）
  { key: "EMPLOYEE_MASTER", label: "人員名冊", api: "/api/uploads/employee-master" },
  { key: "DAILY_REVENUE", label: "每日營收", api: "/api/uploads/daily-revenue" },
  // 現貨文已改為「內容篇數填報」頁面，不再上傳
] as const;

type BatchInfo = {
  uploadedAt: string;
  originalName: string;
  recordCount: number;
} | null;

export default function UploadsPage() {
  const [batches, setBatches] = useState<Record<string, BatchInfo>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ key: string; message: string; row?: number }[]>([]);
  const [success, setSuccess] = useState<{ key: string; count: number } | null>(null);

  const fetchBatches = useCallback(async () => {
    const res = await fetch("/api/uploads/batches");
    if (res.ok) setBatches(await res.json());
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function handleUpload(key: string, api: string, file: File) {
    setLoading(key);
    setErrors([]);
    setSuccess(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(api, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrors(
          (data.errors || [{ message: data.error || "上傳失敗" }]).map((e: { row?: number; message: string }) => ({
            key,
            message: e.message,
            row: e.row,
          }))
        );
        return;
      }
      setSuccess({ key, count: data.importedCount ?? 0 });
      if (data.errors?.length) {
        setErrors(
          data.errors.map((e: { row?: number; message: string }) => ({
            key,
            message: e.message,
            row: e.row,
          }))
        );
      }
      await fetchBatches();
    } catch (e) {
      setErrors([{ key, message: e instanceof Error ? e.message : "上傳失敗" }]);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">資料上傳中心</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {FILE_TYPES.find((f) => f.key === success.key)?.label} 上傳成功，匯入 {success.count} 筆。
        </div>
      )}
      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ul className="list-inside list-disc">
            {errors.map((e, i) => (
              <li key={i}>
                {e.row ? `第 ${e.row} 列：` : ""}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FILE_TYPES.map(({ key, label, api }) => (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="font-medium text-slate-800">{label}</h2>
            {batches[key] ? (
              <p className="mt-2 text-sm text-slate-500">
                最近上傳：{new Date(batches[key]!.uploadedAt).toLocaleString("zh-TW")}
                <br />
                檔名：{batches[key]!.originalName}
                <br />
                筆數：{batches[key]!.recordCount}
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-400">尚無上傳紀錄</p>
            )}
            <label className="mt-3 block">
              <span className="sr-only">選擇檔案</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="block w-full text-sm text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sky-700"
                disabled={loading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(key, api, f);
                  e.target.value = "";
                }}
              />
            </label>
            {key === "EMPLOYEE_MASTER" && (
              <div className="mt-3">
                <Link
                  href="/reserve-staff"
                  className="text-sm text-sky-700 hover:underline"
                >
                  前往「儲備人力設定」
                </Link>
              </div>
            )}
            {loading === key && (
              <p className="mt-2 text-sm text-sky-600">上傳中…</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
