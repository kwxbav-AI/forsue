import Link from "next/link";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <Link href="/" className="text-lg font-semibold text-slate-800">
            每日績效計算系統 <span className="text-xs font-normal text-sky-600">網頁版</span>
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link href="/uploads" className="text-slate-600 hover:text-sky-600">
              上傳
            </Link>
            <Link href="/workhour-adjustments" className="text-slate-600 hover:text-sky-600">
              工時異動
            </Link>
            <Link href="/performance/daily" className="text-slate-600 hover:text-sky-600">
              每日工效
            </Link>
            <Link href="/performance/target-summary" className="text-slate-600 hover:text-sky-600">
              達標統計
            </Link>
            <Link href="/settings/performance-target" className="text-slate-600 hover:text-sky-600">
              目標設定
            </Link>
            <Link href="/settings/holidays" className="text-slate-600 hover:text-sky-600">
              假日設定
            </Link>
            <Link href="/stores" className="text-slate-600 hover:text-sky-600">
              門市管理
            </Link>
            <Link href="/dispatches" className="text-slate-600 hover:text-sky-600">
              調度填報
            </Link>
            <Link href="/content-entries" className="text-slate-600 hover:text-sky-600">
              內容篇數填報
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
