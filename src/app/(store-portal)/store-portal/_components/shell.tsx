"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type StoreOption = {
  id: string;
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
  allStores,
  isAdmin,
  children,
}: {
  storeInfo: StoreInfo;
  allStores?: StoreOption[];
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedStoreId = searchParams.get("storeId") ?? "";

  const initials = storeInfo.username.slice(0, 1);

  const selectedStore = allStores?.find((s) => s.id === selectedStoreId);
  const displayStoreName = isAdmin
    ? (selectedStore?.storeName ?? "請選擇門市")
    : storeInfo.storeName;
  const displayRegion = isAdmin
    ? (selectedStore?.region ?? null)
    : storeInfo.region;

  const isTaoyuan = displayRegion?.includes("桃園");
  const regionColor = displayRegion
    ? isTaoyuan
      ? "bg-purple-50 text-purple-700"
      : "bg-emerald-50 text-emerald-700"
    : "bg-slate-100 text-slate-400";

  function navHref(href: string) {
    if (isAdmin && selectedStoreId) return `${href}?storeId=${selectedStoreId}`;
    return href;
  }

  function handleStoreChange(storeId: string) {
    const base = pathname.startsWith("/store-portal/") ? pathname : "/store-portal/overview";
    router.push(storeId ? `${base}?storeId=${storeId}` : base);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-3">
          {isAdmin ? (
            <select
              value={selectedStoreId}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="mb-1 w-full rounded border border-slate-200 bg-white px-2 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="">— 選擇門市 —</option>
              {(allStores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-base font-bold text-slate-800">{displayStoreName}</div>
          )}
          {displayRegion && (
            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold ${regionColor}`}>
              {displayRegion}
            </span>
          )}
          {isAdmin && !displayRegion && selectedStore && (
            <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-400">
              未設定區域
            </span>
          )}
          <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">
              {initials}
            </div>
            <span className="truncate text-sm font-medium text-slate-600">
              {storeInfo.username}
              {isAdmin && <span className="ml-1 font-bold text-amber-500">管</span>}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-1">
          {GROUPS.map((group) => {
            const items = NAV_ITEMS.filter((i) => i.group === group);
            return (
              <div key={group}>
                <div className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {group}
                </div>
                {items.map((item) => {
                  const isActive = pathname === item.href;
                  const disabled = isAdmin && !selectedStoreId && group === "主要";
                  return (
                    <Link
                      key={item.href}
                      href={disabled ? "#" : navHref(item.href)}
                      className={[
                        "flex items-center gap-2 border-l-2 px-3 py-2.5 text-sm font-medium",
                        disabled
                          ? "cursor-not-allowed border-transparent text-slate-300"
                          : isActive
                          ? "border-emerald-500 bg-slate-50 font-medium text-emerald-700"
                          : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                      ].join(" ")}
                      onClick={disabled ? (e) => e.preventDefault() : undefined}
                    >
                      <item.Icon size={16} />
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
        {isAdmin && !selectedStoreId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <div className="mb-3 text-3xl text-slate-200">🏪</div>
              <p className="text-sm font-medium text-slate-500">請先從左側選擇門市</p>
              <p className="mt-1 text-xs text-slate-400">選擇後即可檢視該門市的業績、月曆與出勤資料</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
