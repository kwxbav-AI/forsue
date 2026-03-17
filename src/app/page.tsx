import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <header className="mb-8 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2 text-sm text-sky-600">
          <span className="rounded bg-sky-100 px-2 py-0.5 font-medium">網頁版</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-slate-800 sm:text-3xl">
          每日績效計算系統
        </h1>
        <p className="mt-1 text-slate-600">
          在瀏覽器中使用：上傳 Excel、查詢工效比、達標統計、工時異動與目標設定
        </p>
      </header>
      <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/uploads"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">資料上傳中心</span>
          <p className="mt-1 text-sm text-slate-500">上傳出勤、營收、人員名冊（調度與內容篇數請至填報頁面）</p>
        </Link>
        <Link
          href="/workhour-related"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">工時異動相關</span>
          <p className="mt-1 text-sm text-slate-500">人員調度、工時異動調整、現貨文填報</p>
        </Link>
        <Link
          href="/performance/daily"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">每日工效比</span>
          <p className="mt-1 text-sm text-slate-500">查看每日各門市營收、工時、工效比、是否達標</p>
        </Link>
        <Link
          href="/performance/target-summary"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">達標次數統計</span>
          <p className="mt-1 text-sm text-slate-500">期間內各門市達標天數、達標率、平均工效比</p>
        </Link>
        <Link
          href="/settings/performance-target"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">目標值設定</span>
          <p className="mt-1 text-sm text-slate-500">設定全門市共用目標工效值與生效日</p>
        </Link>
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
      </nav>
      <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
        本系統為網頁版，請在瀏覽器開啟此頁面使用。執行 <code className="rounded bg-slate-200 px-1">npm run dev</code> 後訪問
        <code className="ml-1 rounded bg-slate-200 px-1">http://localhost:3000</code> 即可。
      </footer>
    </div>
  );
}
