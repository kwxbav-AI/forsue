import Link from "next/link";

export default function ReportsHubPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">報表區</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/performance/daily"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">每日工效比</span>
          <p className="mt-1 text-sm text-slate-500">查看每日各門市營收、工時、工效比、是否達標</p>
        </Link>
        <Link
          href="/reports/charts"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">圖表</span>
          <p className="mt-1 text-sm text-slate-500">區間加總（全門市營收/工時）、排序與工效比長條圖</p>
        </Link>
        <Link
          href="/performance/target-summary"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">達標次數統計</span>
          <p className="mt-1 text-sm text-slate-500">期間內各門市達標天數、達標率、平均工效比</p>
        </Link>
      </div>
    </div>
  );
}

