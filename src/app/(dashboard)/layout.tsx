import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth-config";

export const dynamic = "force-dynamic";
import { getServerSession } from "@/lib/auth-server";
import { DEFAULT_ROLE_LABELS } from "@/lib/permissions";
import {
  canAccessPageDb,
  canAccessReportsSectionDb,
  canAccessWorkhourRelatedSectionDb,
} from "@/lib/permissions-db";
import { AuthLogoutButton } from "@/components/auth-logout-button";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authOn = isAuthEnabled();
  const session = await getServerSession();
  const showLogout = authOn;
  const canUploads =
    !authOn ||
    (session != null &&
      (await canAccessPageDb({ id: session.roleId, key: session.roleKey }, "/uploads")));
  const canWorkhourRelated =
    !authOn ||
    (session != null &&
      (await canAccessWorkhourRelatedSectionDb({
        id: session.roleId,
        key: session.roleKey,
      })));
  const canReports =
    !authOn ||
    (session != null &&
      (await canAccessReportsSectionDb({
        id: session.roleId,
        key: session.roleKey,
      })));
  const canData =
    !authOn ||
    (session != null &&
      (await canAccessPageDb({ id: session.roleId, key: session.roleKey }, "/data")));
  const canSettings =
    !authOn ||
    (session != null &&
      (await canAccessPageDb({ id: session.roleId, key: session.roleKey }, "/settings")));
  const canOperations =
    !authOn ||
    (session != null &&
      (await canAccessPageDb(
        { id: session.roleId, key: session.roleKey },
        "/operations/dashboard"
      )));
  const hasSupervisorStores =
    authOn && session != null
      ? (await prisma.supervisorStore.count({ where: { supervisorId: session.userId } })) > 0
      : false;
  const hasRetailStore =
    authOn && session != null
      ? (await prisma.appUser.count({ where: { id: session.userId, retailStoreId: { not: null } } })) > 0
      : false;
  const canStorePortal =
    !authOn ||
    hasSupervisorStores ||
    hasRetailStore ||
    (session != null &&
      (await canAccessPageDb(
        { id: session.roleId, key: session.roleKey },
        "/store-portal/overview"
      )));
  const canBonus =
    !authOn ||
    (session != null &&
      (await canAccessPageDb(
        { id: session.roleId, key: session.roleKey },
        "/bonus/monthly"
      )));
  const canNorthDashboard =
    !authOn ||
    (session != null &&
      (await canAccessPageDb(
        { id: session.roleId, key: session.roleKey },
        "/operations/north"
      )));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="text-lg font-semibold text-slate-800">
              每日績效計算系統 <span className="text-xs font-normal text-sky-600">網頁版</span>
            </Link>
            {showLogout && session ? (
              <span className="text-xs text-slate-500">
                {session.username} ·{" "}
                {session.roleName ??
                  DEFAULT_ROLE_LABELS[session.roleKey] ??
                  session.roleKey}
              </span>
            ) : null}
            {showLogout ? <AuthLogoutButton /> : null}
          </div>
          <nav className="flex flex-wrap gap-3 text-sm" style={{ marginRight: "5cm" }}>
            {canUploads ? (
              <Link href="/uploads" className="text-slate-600 hover:text-sky-600">
                資料上傳中心
              </Link>
            ) : null}
            {canWorkhourRelated ? (
              <Link href="/workhour-related" className="text-slate-600 hover:text-sky-600">
                工時異動相關
              </Link>
            ) : null}
            {canReports ? (
              <Link href="/reports" className="text-slate-600 hover:text-sky-600">
                報表區
              </Link>
            ) : null}
            {canData ? (
              <Link href="/data" className="text-slate-600 hover:text-sky-600">
                資料區
              </Link>
            ) : null}
            {canSettings ? (
              <Link href="/settings" className="text-slate-600 hover:text-sky-600">
                設定區
              </Link>
            ) : null}
            {canBonus ? (
              <Link href="/bonus/monthly" className="text-slate-600 hover:text-sky-600">
                績效獎金
              </Link>
            ) : null}
            {canOperations ? (
              <Link
                href="/operations/dashboard"
                className="text-slate-600 hover:text-sky-600"
              >
                營運部Dashboard
              </Link>
            ) : null}
            {canStorePortal ? (
              <Link href="/store-portal/overview" className="text-slate-600 hover:text-sky-600">
                門市入口
              </Link>
            ) : null}
            {canNorthDashboard ? (
              <Link href="/operations/north" className="text-slate-600 hover:text-sky-600">
                北區Dashboard
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl p-4">{children}</main>
    </div>
  );
}
