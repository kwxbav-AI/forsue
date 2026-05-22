"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Users,
  Clock,
  Store,
  TrendingUp,
} from "lucide-react";

type ImportType = {
  key: string;
  label: string;
  desc: string;
  api: string;
  permissionKey: string;
  icon: typeof Upload;
  gradient: string;
};

const IMPORT_TYPES: ImportType[] = [
  {
    key: "DAILY_REVENUE",
    label: "每日營收（日結）",
    desc: "營收日期、門市代碼、營收金額等（與資料上傳中心相同）",
    api: "/api/uploads/daily-revenue",
    permissionKey: "uploads-daily-revenue",
    icon: TrendingUp,
    gradient: "from-teal-500 to-teal-600",
  },
  {
    key: "ATTENDANCE",
    label: "人員出勤表",
    desc: "出勤日期、員工、工時（與資料上傳中心相同）",
    api: "/api/uploads/attendance",
    permissionKey: "uploads-attendance",
    icon: Clock,
    gradient: "from-purple-500 to-purple-600",
  },
  {
    key: "EMPLOYEE_MASTER",
    label: "人員名冊",
    desc: "員工編號、姓名、門市等",
    api: "/api/uploads/employee-master",
    permissionKey: "uploads-employee-master",
    icon: Users,
    gradient: "from-emerald-500 to-emerald-600",
  },
];

type BatchInfo = {
  uploadedAt: string;
  originalName: string;
  recordCount: number;
} | null;

export default function OperationsAdminPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeKey, setActiveKey] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [errors, setErrors] = useState<{ row?: number; message: string }[]>([]);
  const [batches, setBatches] = useState<Record<string, BatchInfo>>({});
  const [allowedKeys, setAllowedKeys] = useState<Set<string> | null>(null);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/uploads/batches");
    if (res.ok) setBatches(await res.json());
  }, []);

  useEffect(() => {
    void loadBatches();
    void fetch("/api/role-permissions/effective")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const keys = new Set<string>(data?.allowedModuleKeys ?? []);
        if (data?.roleKey === "ADMIN") {
          setAllowedKeys(new Set(IMPORT_TYPES.map((t) => t.permissionKey)));
          return;
        }
        setAllowedKeys(keys);
      });
  }, [loadBatches]);

  const visibleTypes = IMPORT_TYPES.filter(
    (t) => allowedKeys?.has("uploads") || allowedKeys?.has(t.permissionKey)
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const type = IMPORT_TYPES.find((t) => t.key === activeKey);
    if (!file || !type) return;

    setLoading(type.key);
    setMessage(null);
    setErrors([]);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(type.api, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "上傳失敗" });
        setErrors(data.errors ?? []);
        return;
      }
      setMessage({
        type: "ok",
        text: `${type.label} 成功匯入 ${data.importedCount ?? data.imported ?? 0} 筆`,
      });
      if (data.errors?.length) setErrors(data.errors);
      await loadBatches();
    } catch {
      setMessage({ type: "err", text: "上傳失敗" });
    } finally {
      setLoading(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">資料匯入中心</h1>
        <p className="mt-1 text-sm text-slate-500">
          與「資料上傳中心」共用同一套 API；此處為 COO 營運模組整合介面。
        </p>
      </div>

      {message ?
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "ok" ?
              "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {message.text}
        </div>
      : null}

      {errors.length > 0 ?
        <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 list-disc list-inside">
          {errors.slice(0, 20).map((e, i) => (
            <li key={i}>
              {e.row ? `第 ${e.row} 列：` : ""}
              {e.message}
            </li>
          ))}
        </ul>
      : null}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => void handleFile(e)}
      />

      {allowedKeys === null ?
        <p className="text-sm text-slate-500">載入權限中…</p>
      : visibleTypes.length === 0 ?
        <p className="text-sm text-slate-600">您沒有資料匯入權限。</p>
      : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTypes.map((t) => {
            const Icon = t.icon;
            const batch = batches[t.key];
            return (
              <div
                key={t.key}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${t.gradient} text-white`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-slate-800">{t.label}</h3>
                <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
                {batch ?
                  <p className="mt-2 text-xs text-slate-400">
                    最近：{batch.originalName}（{batch.recordCount} 筆）
                  </p>
                : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={loading === t.key}
                    onClick={() => {
                      setActiveKey(t.key);
                      fileRef.current?.click();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {loading === t.key ? "上傳中…" : "上傳匯入"}
                  </button>
                  <Link
                    href="/uploads"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    進階上傳
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">門市與目標設定</p>
        <p className="mt-1">
          門市主檔、月目標請至
          <Link href="/operations/stores" className="mx-1 text-blue-700 hover:underline">
            門市管理
          </Link>
          與
          <Link href="/operations/store-targets" className="mx-1 text-blue-700 hover:underline">
            門市目標
          </Link>
          維護；月目標請以 Excel 批次匯入（業績目標 + 目標工時兩檔）。
        </p>
      </div>
    </div>
  );
}
