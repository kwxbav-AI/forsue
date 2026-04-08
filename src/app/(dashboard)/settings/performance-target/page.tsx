"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatLocalDateInput } from "@/lib/date";

type ActiveTarget = {
  id: string;
  targetValue: number;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
};

type HistoryItem = ActiveTarget & {
  isActive: boolean;
  updatedBy: string | null;
  createdAt: string;
};

export default function PerformanceTargetPage() {
  const [active, setActive] = useState<ActiveTarget | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [form, setForm] = useState({
    targetValue: 4000,
    effectiveStartDate: formatLocalDateInput(),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/performance-target");
    if (res.ok) {
      const data = await res.json();
      setActive(data.active);
      setHistory(data.history ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function submitNew() {
    setMessage(null);
    const res = await fetch("/api/settings/performance-target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetValue: form.targetValue,
        effectiveStartDate: form.effectiveStartDate,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      fetchData();
    } else {
      const data = await res.json();
      alert(data.error || "設定失敗");
    }
  }

  async function recalcAll() {
    if (!confirm("確定要重算所有歷史日期的每日工效比？（可能需要一些時間）")) return;
    setMessage(null);
    setRecalcLoading(true);
    const res = await fetch("/api/performance/recalculate-all", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setRecalcLoading(false);
    if (!res.ok) {
      setMessage(data.error || "重算失敗");
      return;
    }
    setMessage(`已重算完成：${data.datesCount ?? 0} 天`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">目標工效值設定</h1>
        <Link href="/" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          回首頁
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">載入中…</p>
      ) : (
        <>
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-medium text-slate-800">目前生效目標</h2>
            {active ? (
              <p className="text-lg">
                <span className="font-semibold text-sky-600">{active.targetValue.toLocaleString("zh-TW")}</span>
                <span className="ml-2 text-slate-600">
                  生效日：{active.effectiveStartDate}
                  {active.effectiveEndDate ? ` ～ ${active.effectiveEndDate}` : ""}
                </span>
              </p>
            ) : (
              <p className="text-slate-500">尚無設定（系統將使用預設值 4000）</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
              >
                新增 / 變更目標值
              </button>
              <button
                type="button"
                disabled={recalcLoading}
                onClick={recalcAll}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recalcLoading ? "重算中…" : "重算全部歷史績效"}
              </button>
            </div>
          </div>

          {showForm && (
            <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 p-4">
              <h3 className="mb-3 font-medium text-slate-800">新增目標設定</h3>
              <p className="mb-3 text-sm text-slate-600">
                新設定生效後，新計算的績效將套用新目標值；若要讓歷史也跟著變動，請按「重算全部歷史績效」。
              </p>
              <div className="flex flex-wrap items-end gap-4">
                <label>
                  <span className="block text-sm text-slate-600">目標工效值</span>
                  <input
                    type="number"
                    value={form.targetValue}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, targetValue: parseInt(e.target.value, 10) || 0 }))
                    }
                    className="mt-1 rounded border border-slate-300 px-2 py-1.5"
                  />
                </label>
                <label>
                  <span className="block text-sm text-slate-600">生效起日</span>
                  <input
                    type="date"
                    value={form.effectiveStartDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, effectiveStartDate: e.target.value }))
                    }
                    className="mt-1 rounded border border-slate-300 px-2 py-1.5"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitNew}
                    className="rounded bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-medium text-slate-800">歷史設定</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">尚無歷史紀錄</p>
            ) : (
              <div className="relative max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="sticky top-0 z-10 border-b border-slate-200 bg-white text-left">
                      <th className="sticky left-0 z-20 w-[120px] min-w-[120px] bg-white py-2 font-medium text-slate-700">
                        目標值
                      </th>
                      <th className="sticky left-[120px] z-20 w-[140px] min-w-[140px] bg-white py-2 font-medium text-slate-700">
                        生效起日
                      </th>
                      <th className="py-2 font-medium text-slate-700">生效迄日</th>
                      <th className="py-2 font-medium text-slate-700">狀態</th>
                      <th className="py-2 font-medium text-slate-700">建立時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100">
                        <td className="sticky left-0 z-[5] w-[120px] min-w-[120px] bg-white py-2">
                          {h.targetValue.toLocaleString("zh-TW")}
                        </td>
                        <td className="sticky left-[120px] z-[5] w-[140px] min-w-[140px] bg-white py-2">
                          {h.effectiveStartDate}
                        </td>
                        <td className="py-2">{h.effectiveEndDate ?? "—"}</td>
                        <td className="py-2">
                          {h.isActive ? (
                            <span className="text-green-600">生效中</span>
                          ) : (
                            <span className="text-slate-400">已停用</span>
                          )}
                        </td>
                        <td className="py-2 text-slate-500">{new Date(h.createdAt).toLocaleString("zh-TW")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
