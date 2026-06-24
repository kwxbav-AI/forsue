"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthLogoutButton } from "@/components/auth-logout-button";
import {
  BarChart3,
  CalendarDays,
  Fingerprint,
  ArrowLeftRight,
  AlarmClockPlus,
  FileText,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

type StoreInfo = {
  username: string;
  storeName: string;
  region: string | null;
};

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  group: string;
  external?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/store-portal/overview", label: "業績總覽", Icon: BarChart3, group: "主要" },
  { href: "/store-portal/calendar", label: "月曆 & 達標", Icon: CalendarDays, group: "主要" },
  { href: "/store-portal/attendance", label: "出勤紀錄", Icon: Fingerprint, group: "主要" },
  { href: "/store-portal/dispatch", label: "人員調度", Icon: ArrowLeftRight, group: "工時異動", external: true },
  { href: "/store-portal/deductions", label: "效期 / 清掃", Icon: AlarmClockPlus, group: "工時異動", external: true },
  { href: "/store-portal/inventory", label: "現貨文填報", Icon: FileText, group: "工時異動", external: true },
];

const GROUPS = ["主要", "工時異動"];

export function StorePortalShell({
  storeInfo,
  children,
}: {
  storeInfo: StoreInfo;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const initials = storeInfo.username.slice(0, 1);

  const isTaoyuan = storeInfo.region?.includes("桃園");
  const regionColor = isTaoyuan
    ? "bg-purple-50 text-purple-700"
    : "bg-emerald-50 text-emerald-700";

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-48 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          <div className="text-sm font-medium text-slate-800">{storeInfo.storeName}</div>
          {storeInfo.region && (
            <span
              className={`mt-1 inline-block rounded px-1.5 py-px text-[10px] font-medium ${regionColor}`}
            >
              {storeInfo.region}
            </span>
          )}
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-medium text-emerald-800">
              {initials}
            </div>
            <span className="truncate text-[11px] text-slate-500">
              {storeInfo.username}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((i) => i.group === group);
            return (
              <div key={group}>
                <div className="px-3 pb-1 pt-3 text-[9px] font-medium uppercase tracking-wider text-slate-400">
                  {group}
                </div>
                {items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "flex items-center gap-2 border-l-2 px-3 py-2 text-xs",
                        isActive
                          ? "border-emerald-500 bg-slate-50 font-medium text-emerald-700"
                          : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                      ].join(" ")}
                    >
                      <item.Icon size={14} />
                      <span className="flex-1">{item.label}</span>
                      {item.external && (
                        <ExternalLink size={10} className="text-slate-300" />
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <AuthLogoutButton />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
