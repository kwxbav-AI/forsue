import Link from "next/link";

export default function DataHubPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">資料區</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/reports/attendance"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">人員出勤表</span>
          <p className="mt-1 text-sm text-slate-500">依員工與部門查詢每日出勤工時</p>
        </Link>
        <Link
          href="/reports/revenue"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">每日營收報表</span>
          <p className="mt-1 text-sm text-slate-500">依門市與部門查詢每日營收與短溢</p>
        </Link>
      </div>
    </div>
  );
}

