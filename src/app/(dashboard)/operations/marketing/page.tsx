import Link from "next/link";

export default function OperationsMarketingPage() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">活動成效分析</h1>
      <p className="mt-2 text-sm text-slate-600">
        C 階段功能：全通路行銷活動進度與門市參與率。總覽頁目前為示意進度條。
      </p>
      <Link href="/operations/dashboard" className="mt-6 inline-block text-blue-700 text-sm hover:underline">
        返回營運總覽
      </Link>
    </div>
  );
}
