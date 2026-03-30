import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";

export const dynamic = "force-dynamic";
import { getServerSession } from "@/lib/auth-server";
import { USER_ROLE_LABELS } from "@/lib/permissions";
import { AuthLogoutButton } from "@/components/auth-logout-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authOn = isAuthEnabled();
  const session = await getServerSession();
  const showLogout = authOn;
  const canEdit =
    !authOn ||
    (session != null &&
      (session.role === "ADMIN" || session.role === "EDITOR"));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-lg font-semibold text-slate-800">
              每日績效計算系統 <span className="text-xs font-normal text-sky-600">網頁版</span>
            </Link>
            {showLogout && session ? (
              <span className="text-xs text-slate-500">
                {session.username} · {USER_ROLE_LABELS[session.role]}
              </span>
            ) : null}
            {showLogout ? <AuthLogoutButton /> : null}
          </div>
          <nav className="flex flex-wrap gap-3 text-sm">
            {canEdit ? (
              <Link href="/uploads" className="text-slate-600 hover:text-sky-600">
                資料上傳中心
              </Link>
            ) : null}
            {canEdit ? (
              <Link href="/workhour-related" className="text-slate-600 hover:text-sky-600">
                工時異動相關
              </Link>
            ) : null}
            <Link href="/reports" className="text-slate-600 hover:text-sky-600">
              報表區
            </Link>
            <Link href="/data" className="text-slate-600 hover:text-sky-600">
              資料區
            </Link>
            {canEdit ? (
              <Link href="/settings" className="text-slate-600 hover:text-sky-600">
                設定區
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
