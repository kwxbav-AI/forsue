import Link from "next/link";
import { ExternalLink, ArrowRight } from "lucide-react";

export default function DeductionsRedirectPage() {
  return (
    <div className="flex flex-col">
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-sm font-medium text-slate-800">效期 / 清掃工時</h1>
        <p className="text-xs text-slate-400">工時異動填報</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <ExternalLink size={20} className="text-slate-400" />
          </div>
          <h2 className="mb-2 text-sm font-medium text-slate-700">效期 / 清掃工時填報</h2>
          <p className="mb-6 text-xs text-slate-400">
            填寫效期整理或清掃工作的工時，包含員工、日期與時數。
          </p>
          <Link
            href="/store-hour-deductions"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            前往填報
            <ArrowRight size={14} />
          </Link>
          <p className="mt-3 text-[10px] text-slate-400">將開啟現有填報頁面（登入帳號相同）</p>
        </div>
      </div>
    </div>
  );
}
