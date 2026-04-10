import Link from "next/link";
import { getServerSession } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth-config";
import { canAccessPageDb } from "@/lib/permissions-db";

export default async function SettingsHubPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();
  const canOpen = async (pathname: string) => {
    if (!authOn) return true;
    return session != null && (await canAccessPageDb(session.role, pathname));
  };

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
        {(await canOpen("/settings/users")) ? (
          <Link
            href="/settings/users"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">帳號與權限</span>
            <p className="mt-1 text-sm text-slate-500">新增帳號、角色（管理員／編輯者／檢視者）</p>
          </Link>
        ) : null}
        {(await canOpen("/settings/role-permissions")) ? (
          <Link
            href="/settings/role-permissions"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">角色權限設定</span>
            <p className="mt-1 text-sm text-slate-500">勾選模組的讀取/寫入與不出現</p>
          </Link>
        ) : null}
        {(await canOpen("/stores")) ? (
          <Link
            href="/stores"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">門市管理</span>
            <p className="mt-1 text-sm text-slate-500">新增/編輯/停用門市與代碼對照</p>
          </Link>
        ) : null}
        {(await canOpen("/reserve-staff")) ? (
          <Link
            href="/reserve-staff"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">儲備人力設定</span>
            <p className="mt-1 text-sm text-slate-500">設定儲備人力與工時計算%</p>
          </Link>
        ) : null}
        {(await canOpen("/settings/holidays")) ? (
          <Link
            href="/settings/holidays"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">假日設定</span>
            <p className="mt-1 text-sm text-slate-500">設定特殊假日（不計入達標總天數）</p>
          </Link>
        ) : null}
        {(await canOpen("/settings/performance-target")) ? (
          <Link
            href="/settings/performance-target"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">目標值設定</span>
            <p className="mt-1 text-sm text-slate-500">設定目標工效值與生效日</p>
          </Link>
        ) : null}
        {(await canOpen("/settings/attendance-location")) ? (
          <Link
            href="/settings/attendance-location"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow"
          >
            <span className="font-medium text-slate-800">出勤打卡地點比對</span>
            <p className="mt-1 text-sm text-slate-500">設定哪些部門不做打卡地點比對</p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
