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
              資料上傳中心
            </Link>
            <Link href="/workhour-related" className="text-slate-600 hover:text-sky-600">
              工時異動相關
            </Link>
            <Link href="/reports" className="text-slate-600 hover:text-sky-600">
              報表區
            </Link>
            <Link href="/data" className="text-slate-600 hover:text-sky-600">
              資料區
            </Link>
            <Link href="/settings" className="text-slate-600 hover:text-sky-600">
              設定區
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
