import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";

export default async function SettingsHubPage() {
  const session = await getServerSession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">設定區</h1>
        <Link
          href="/"
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          回首頁
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isAdmin ? (
          <Link
            href="/settings/users"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">帳號與權限</span>
            <p className="mt-1 text-sm text-slate-500">新增帳號、角色（管理員／編輯者／檢視者）</p>
          </Link>
        ) : null}
        <Link
          href="/stores"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">門市管理</span>
          <p className="mt-1 text-sm text-slate-500">新增/編輯/停用門市與代碼對照</p>
        </Link>
        <Link
          href="/reserve-staff"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">儲備人力設定</span>
          <p className="mt-1 text-sm text-slate-500">設定儲備人力與工時計算%</p>
        </Link>
        <Link
          href="/settings/holidays"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">假日設定</span>
          <p className="mt-1 text-sm text-slate-500">設定特殊假日（不計入達標總天數）</p>
        </Link>
        <Link
          href="/settings/performance-target"
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
        >
          <span className="font-medium text-slate-800">目標值設定</span>
          <p className="mt-1 text-sm text-slate-500">設定目標工效值與生效日</p>
        </Link>
      </div>
    </div>
  );
}
