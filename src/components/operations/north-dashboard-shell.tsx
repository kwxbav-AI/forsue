"use client";

import { BarChart3, LayoutDashboard } from "lucide-react";
import { OperationsShell } from "./operations-shell";
import type { OpsNavItem } from "./ops-nav";

const NORTH_NAV: OpsNavItem[] = [
  {
    href: "/operations/north",
    label: "北區總覽",
    icon: LayoutDashboard,
    permissionKey: "operations-north-dashboard",
  },
  {
    href: "/operations/north/analysis",
    label: "北區績效分析",
    icon: BarChart3,
    permissionKey: "operations-north-dashboard",
  },
];

export function NorthDashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <OperationsShell visibleNav={NORTH_NAV} title="北區Dashboard" subtitle="台北區">
      {children}
    </OperationsShell>
  );
}
