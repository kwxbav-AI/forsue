import Link from "next/link";

export default function OperationsSupervisionPage() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">督導管理</h1>
      <p className="mt-2 text-sm text-slate-600">
        C 階段功能：巡店任務、高優先預警與改善追蹤。目前營運總覽已依工效比「未達標」門市顯示警示清單。
      </p>
      <p className="mt-4 text-sm text-slate-500">
        獎金規則預覽：每月總達標次數 × 168 元 + 營運成果獎金（待實作計算引擎）。
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/operations/supervision/support-calendar"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-slate-800">人力支援管理</h2>
          <p className="mt-1 text-xs text-slate-500">
            月曆熱力圖總覽 · 點選日期查看門市缺口與支援明細
          </p>
        </Link>
      </div>
      <Link href="/operations/dashboard" className="mt-6 inline-block text-blue-700 text-sm hover:underline">
        返回營運總覽
      </Link>
    </div>
  );
}
