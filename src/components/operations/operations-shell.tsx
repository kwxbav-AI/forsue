"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { OpsNavItem } from "./ops-nav";
import { OPS_COLORS } from "@/lib/ops-color-tokens";

const SIDEBAR_BG = "#0f172a";
const SIDEBAR_ACTIVE = "#1e40af";
const STORE_OPS_ACTIVE = "#BA7517";

function NavLink({
  item,
  active,
  badgeCount,
}: {
  item: OpsNavItem;
  active: boolean;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  const activeBg = item.storeOps ? STORE_OPS_ACTIVE : SIDEBAR_ACTIVE;

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active ?
          "font-medium text-white shadow-sm"
        : item.storeOps ?
          "text-amber-100/90 hover:bg-amber-900/30 hover:text-white"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
      style={active ? { backgroundColor: activeBg } : undefined}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-90" />
      <span>{item.label}</span>
      {item.badge === "dynamic" && badgeCount && badgeCount > 0 ?
        <span
          className="ml-auto min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold text-white"
          style={{ backgroundColor: OPS_COLORS.achievement.chartDeep }}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      : item.badge && item.badge !== "dynamic" ?
        <span className="ml-auto rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
          {item.badge}
        </span>
      : null}
    </Link>
  );
}

export function OperationsShell({
  children,
  visibleNav,
}: {
  children: React.ReactNode;
  visibleNav: OpsNavItem[];
}) {
  const pathname = usePathname();
  const [notifyCount, setNotifyCount] = useState(0);

  const hasDynamicBadge = visibleNav.some((i) => i.badge === "dynamic");

  useEffect(() => {
    if (!hasDynamicBadge) return;
    void fetch("/api/operations/store-ops/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setNotifyCount(Array.isArray(data?.items) ? data.items.length : 0))
      .catch(() => setNotifyCount(0));
  }, [hasDynamicBadge, pathname]);

  let lastWasStoreOps = false;
  let lastWasSupervision = false;

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] flex min-h-[calc(100vh-4rem)] w-screen max-w-none bg-slate-100">
      <aside
        className="flex w-56 shrink-0 flex-col border-r border-slate-800 text-white"
        style={{ backgroundColor: SIDEBAR_BG }}
      >
        <div className="border-b border-slate-700/80 px-4 py-5">
          <h1 className="text-lg font-bold leading-tight">營運部Dashboard</h1>
          <p className="mt-1 text-xs text-slate-400">宜蘭 · 桃園</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/operations/dashboard" && pathname.startsWith(item.href));
            const showStoreOpsLabel = item.storeOps && !lastWasStoreOps;
            const showSupervisionLabel = item.supervision && !lastWasSupervision;
            if (item.storeOps) lastWasStoreOps = true;
            else lastWasStoreOps = false;
            if (item.supervision) lastWasSupervision = true;
            else lastWasSupervision = false;

            return (
              <div key={item.href}>
                {showStoreOpsLabel ?
                  <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                    店務管理
                  </p>
                : null}
                {showSupervisionLabel ?
                  <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-sky-400/80">
                    督導管理
                  </p>
                : null}
                <NavLink
                  item={item}
                  active={active}
                  badgeCount={item.badge === "dynamic" ? notifyCount : undefined}
                />
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-700/80 p-3 text-[10px] text-slate-500">
          整合 forsue 績效系統
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  );
}
