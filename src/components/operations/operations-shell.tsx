"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPS_NAV_ITEMS, type OpsNavItem } from "./ops-nav";

const SIDEBAR_BG = "#0f172a";
const SIDEBAR_ACTIVE = "#1e40af";

function NavLink({ item, active }: { item: OpsNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
        active ?
          "bg-blue-700 font-medium text-white shadow-sm"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
      style={active ? { backgroundColor: SIDEBAR_ACTIVE } : undefined}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-90" />
      <span>{item.label}</span>
      {item.badge ?
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

  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] flex min-h-[calc(100vh-4rem)] w-screen max-w-none bg-slate-100">
      <aside
        className="flex w-56 shrink-0 flex-col border-r border-slate-800 text-white"
        style={{ backgroundColor: SIDEBAR_BG }}
      >
        <div className="border-b border-slate-700/80 px-4 py-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
            COO
          </p>
          <h1 className="text-lg font-bold leading-tight">營運決策儀表板</h1>
          <p className="mt-1 text-xs text-slate-400">宜蘭 · 桃園 · 台北</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/operations/dashboard" && pathname.startsWith(item.href));
            return <NavLink key={item.href} item={item} active={active} />;
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
