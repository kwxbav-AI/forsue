"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const FILE_TYPES: {
  key: string;
  label: string;
  api: string;
  hint?: string;
  multiple?: boolean;
  maxFiles?: number;
}[] = [
  { key: "ATTENDANCE", label: "人員出勤表", api: "/api/uploads/attendance" },
  { key: "EMPLOYEE_MASTER", label: "人員名冊", api: "/api/uploads/employee-master" },
  { key: "DAILY_REVENUE", label: "每日營收", api: "/api/uploads/daily-revenue" },
  {
    key: "CUSTOMER_TRAFFIC",
    label: "來客數／平均客單",
    api: "/api/uploads/customer-traffic",
    hint: "欄位：日期、部門（門市）、來客數、銷售總額、平均客單（民國年如 114.02.03）",
  },
];

type BatchInfo = {
  uploadedAt: string;
  originalName: string;
  recordCount: number;
} | null;

export default function UploadsPage() {
  const [batches, setBatches] = useState<Record<string, BatchInfo>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ key: string; message: string; row?: number }[]>([]);
  const [success, setSuccess] = useState<{ key: string; count: number; fileCount?: number } | null>(null);
  const [replaceEntireDates, setReplaceEntireDates] = useState(false);

  const fetchBatches = useCallback(async () => {
    const res = await fetch("/api/uploads/batches");
    if (res.ok) setBatches(await res.json());
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function handleUpload(
    key: string,
    api: string,
    files: File[],
    options?: { replaceEntireDates?: boolean; maxFiles?: number }
  ) {
    const maxFiles = options?.maxFiles ?? 1;
    if (files.length === 0) return;
    if (files.length > maxFiles) {
      setErrors([
        {
          key,
          message: `一次最多上傳 ${maxFiles} 個檔案（已選 ${files.length} 個）`,
        },
      ]);
      return;
    }

    setLoading(key);
    setErrors([]);
    setSuccess(null);
    const form = new FormData();
    if (maxFiles > 1) {
      for (const file of files) {
        form.append("files", file);
      }
    } else {
      form.append("file", files[0]!);
    }
    if (options?.replaceEntireDates) {
      form.append("replaceEntireDates", "true");
    }
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
      setSuccess({
        key,
        count: data.importedCount ?? data.upserted ?? 0,
        fileCount:
          Array.isArray(data.results) && data.results.length > 0
            ? data.results.length
            : files.length > 1
              ? files.length
              : undefined,
      });

      const batchErrors = (data.results as { filename: string; errors?: { row?: number; message: string }[] }[] | undefined)
        ?.flatMap((r) =>
          (r.errors ?? []).map((e) => ({
            key,
            message: `${r.filename}：${e.message}`,
            row: e.row,
          }))
        );
      if (batchErrors?.length) {
        setErrors(batchErrors);
      } else if (data.errors?.length) {
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
          {FILE_TYPES.find((f) => f.key === success.key)?.label} 上傳成功，匯入 {success.count} 筆
          {success.fileCount != null ? `（${success.fileCount} 個檔案）` : ""}。
          {success.key === "CUSTOMER_TRAFFIC" ?
            <span className="block mt-1 text-xs text-green-700">
              資料將顯示於營運總覽的來客數與平均客單價卡片。
            </span>
          : null}
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
        {FILE_TYPES.map(({ key, label, api, hint, multiple, maxFiles }) => (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h2 className="font-medium text-slate-800">{label}</h2>
            {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
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
            {key === "ATTENDANCE" && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={replaceEntireDates}
                  disabled={loading !== null}
                  onChange={(e) => setReplaceEntireDates(e.target.checked)}
                />
                <span>
                  取代當日全部出勤
                  <span className="mt-0.5 block text-xs text-slate-400">
                    未勾選時只更新檔案內的員工；整批重匯當日請勾選
                  </span>
                </span>
              </label>
            )}
            <label className="mt-3 block">
              <span className="sr-only">選擇檔案</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                multiple={multiple}
                className="block w-full text-sm text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sky-700"
                disabled={loading !== null}
                onChange={(e) => {
                  const list = e.target.files ? [...e.target.files] : [];
                  if (list.length > 0) {
                    handleUpload(key, api, list, {
                      replaceEntireDates:
                        key === "ATTENDANCE" ? replaceEntireDates : undefined,
                      maxFiles: maxFiles ?? 1,
                    });
                  }
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
