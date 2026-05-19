"use client";

import { useMemo } from "react";
import { OperationsShell } from "@/components/operations/operations-shell";
import { OPS_NAV_ITEMS } from "@/components/operations/ops-nav";

function filterVisibleNav(
  isFullAccess: boolean,
  roleKey: string,
  allowedModuleKeys: string[]
) {
  if (isFullAccess || roleKey === "ADMIN") {
    return OPS_NAV_ITEMS;
  }
  const keys = new Set(allowedModuleKeys);
  const hasOps =
    keys.has("operations-dashboard") ||
    keys.has("operations-stores") ||
    keys.has("operations-store-targets") ||
    keys.has("operations-admin") ||
    keys.has("operations-data-api");
  if (!hasOps) return [];

  return OPS_NAV_ITEMS.filter((item) => {
    if (item.permissionKey === "uploads") {
      return (
        keys.has("uploads") ||
        keys.has("uploads-attendance") ||
        keys.has("uploads-daily-revenue") ||
        keys.has("uploads-employee-master") ||
        keys.has("operations-admin")
      );
    }
    return keys.has(item.permissionKey);
  });
}

export function OperationsLayoutClient({
  children,
  initialIsFullAccess,
  initialRoleKey,
  initialRoleName,
  initialUsername,
  initialAllowedModuleKeys,
  authEnabled,
}: {
  children: React.ReactNode;
  initialIsFullAccess: boolean;
  initialRoleKey: string;
  initialRoleName?: string;
  initialUsername?: string;
  initialAllowedModuleKeys: string[];
  authEnabled: boolean;
}) {
  const visibleNav = useMemo(
    () =>
      filterVisibleNav(
        initialIsFullAccess,
        initialRoleKey,
        initialAllowedModuleKeys
      ),
    [initialIsFullAccess, initialRoleKey, initialAllowedModuleKeys]
  );

  if (visibleNav.length === 0) {
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] flex min-h-[calc(100vh-4rem)] w-screen items-center justify-center bg-slate-100 p-8">
        <div className="max-w-md text-center text-sm text-slate-600">
          <p>您沒有營運模組的存取權限，請聯絡管理員。</p>
          <dl className="mt-4 space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-left text-xs text-slate-500">
            <div className="flex justify-between gap-2">
              <dt>登入狀態</dt>
              <dd>
                {authEnabled
                  ? initialUsername
                    ? "已登入"
                    : "未登入"
                  : "未啟用登入（開發模式）"}
              </dd>
            </div>
            {initialUsername ? (
              <div className="flex justify-between gap-2">
                <dt>帳號</dt>
                <dd className="font-mono">{initialUsername}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt>角色</dt>
              <dd>
                {initialRoleName || initialRoleKey || "—"}
                {initialRoleKey ? (
                  <span className="ml-1 font-mono text-slate-400">
                    ({initialRoleKey})
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>營運模組</dt>
              <dd>
                {initialAllowedModuleKeys
                  .filter((k) => k.startsWith("operations"))
                  .join("、") || "無"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            請至「設定區 → 角色權限設定」勾選「營運總覽 Dashboard」，儲存後重新登入。
          </p>
        </div>
      </div>
    );
  }

  return <OperationsShell visibleNav={visibleNav}>{children}</OperationsShell>;
}
