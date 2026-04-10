"use client";

import { useCallback, useEffect, useState } from "react";

type PendingRow = {
  id: string;
  targetId: string;
  status: string;
  requestedByUsername: string | null;
  createdAt: string;
  targetSummary?: string | null;
};

type Segment =
  | "content-entries"
  | "workhour-adjustments"
  | "stores"
  | "store-hour-deductions"
  | "dispatches";

type Props = {
  segment: Segment;
  canRead: boolean;
  canApprove: boolean;
  title?: string;
  refreshKey?: number;
};

export function PendingDeletionPanel({
  segment,
  canRead,
  canApprove,
  title = "待審刪除／停用申請",
  refreshKey = 0,
}: Props) {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pending-deletions/${segment}`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "載入失敗");
      setRows([]);
      setLoading(false);
      return;
    }
    setRows(Array.isArray(data?.requests) ? data.requests : []);
    setLoading(false);
  }, [canRead, segment]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function decide(requestId: string, action: "approve" | "reject") {
    if (action === "reject") {
      const reason = window.prompt("駁回原因（可留空）") ?? "";
      if (reason === null) return;
      const res = await fetch(`/api/pending-deletions/${segment}/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: reason.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "駁回失敗");
        return;
      }
    } else {
      if (!confirm("確定核准此申請？")) return;
      const res = await fetch(`/api/pending-deletions/${segment}/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "核准失敗");
        return;
      }
    }
    await load();
    window.dispatchEvent(new CustomEvent("pending-deletions-changed"));
  }

  if (!canRead) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-900">{title}</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-amber-800 underline disabled:opacity-50"
          disabled={loading}
        >
          重新整理
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-amber-800/80">載入中…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-amber-800/80">目前無待審申請</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-100 bg-white px-3 py-2"
            >
              <div className="text-slate-700">
                <div className="text-xs text-slate-500">
                  {r.targetSummary ? (
                    <span>{r.targetSummary}</span>
                  ) : (
                    <span className="font-mono">標的 {r.targetId.slice(0, 12)}…</span>
                  )}
                </div>
                <span className="mx-2 text-slate-300">|</span>
                申請人 {r.requestedByUsername || "—"}
                <span className="mx-2 text-slate-300">|</span>
                {new Date(r.createdAt).toLocaleString("zh-TW")}
              </div>
              {canApprove ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                    onClick={() => void decide(r.id, "approve")}
                  >
                    核准
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => void decide(r.id, "reject")}
                  >
                    駁回
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
