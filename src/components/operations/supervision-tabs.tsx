"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/operations/supervision/shift-calendar", label: "人員排班月曆" },
  { href: "/operations/supervision/support-calendar", label: "人力支援管理" },
] as const;

export function SupervisionTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
        督導管理
      </span>
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active ?
                "bg-blue-600 font-medium text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
