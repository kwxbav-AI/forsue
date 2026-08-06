"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MissingUploadDate = {
  ymd: string;
  attendanceMissing: boolean;
  revenueMissingStores: string[];
};

type MissingUploadWarning = {
  cutoffYmd: string;
  dates: MissingUploadDate[];
};

function formatMD(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function MissingUploadAlert() {
  const [data, setData] = useState<MissingUploadWarning | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/uploads/missing-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setData(json))
      .catch(() => {});
  }, []);

  if (!data || data.dates.length === 0 || dismissed) return null;

  return (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">提醒：以下日期的營收或出勤表尚未上傳</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {data.dates.map((d) => {
              const parts: string[] = [];
              if (d.attendanceMissing) parts.push("出勤表未上傳");
              if (d.revenueMissingStores.length > 0) {
                parts.push(`營收未上傳：${d.revenueMissingStores.join("、")}`);
              }
              return (
                <li key={d.ymd}>
                  {formatMD(d.ymd)}：{parts.join("；")}
                </li>
              );
            })}
          </ul>
          <Link href="/uploads" className="mt-2 inline-block text-red-700 underline">
            前往資料上傳中心
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-red-400 hover:text-red-600"
          aria-label="關閉提醒"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
