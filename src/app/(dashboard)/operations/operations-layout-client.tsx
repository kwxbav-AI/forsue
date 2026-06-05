"use client";

import { useMemo } from "react";
import { OperationsShell } from "@/components/operations/operations-shell";
import { getOpsNavForRole, OPS_NAV_ITEMS_LEGACY } from "@/components/operations/ops-nav";
import { isRoleKey } from "@/lib/roles";

function filterLegacyNav(allowedModuleKeys: string[]) {
  const keys = new Set(allowedModuleKeys);
  return OPS_NAV_ITEMS_LEGACY.filter((item) => keys.has(item.permissionKey));
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
  const visibleNav = useMemo(() => {
    if (isRoleKey(initialRoleKey)) {
      return getOpsNavForRole(initialRoleKey);
    }
    if (initialIsFullAccess || initialRoleKey === "ADMIN") {
      return getOpsNavForRole("ADMIN");
    }
    return filterLegacyNav(initialAllowedModuleKeys);
  }, [initialIsFullAccess, initialRoleKey, initialAllowedModuleKeys]);

  if (visibleNav.length === 0) {
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] flex min-h-[calc(100vh-4rem)] w-screen items-center justify-center bg-slate-100 p-8">
        <div className="max-w-md text-center text-sm text-slate-600">
          <p>您沒有營運模組的存取權限，請聯絡管理員。</p>
          <dl className="mt-4 space-y-1 rounded-lg border border-slate-200 bg-white p-4 text-left text-xs text-slate-500">
            <div className="flex justify-between gap-2">
              <dt>登入狀態</dt>
              <dd>
                {authEnabled ?
                  initialUsername ?
                    "已登入"
                  : "未登入"
                : "未啟用登入（開發模式）"}
              </dd>
            </div>
            {initialUsername ?
              <div className="flex justify-between gap-2">
                <dt>帳號</dt>
                <dd className="font-mono">{initialUsername}</dd>
              </div>
            : null}
            <div className="flex justify-between gap-2">
              <dt>角色</dt>
              <dd>
                {initialRoleName || initialRoleKey || "—"}
                {initialRoleKey ?
                  <span className="ml-1 font-mono text-slate-400">({initialRoleKey})</span>
                : null}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  return <OperationsShell visibleNav={visibleNav}>{children}</OperationsShell>;
}
