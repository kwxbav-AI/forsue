import { Suspense } from "react";
import { BarChart3, LayoutDashboard } from "lucide-react";
import { OperationsShell } from "@/components/operations/operations-shell";
import type { OpsNavItem } from "@/components/operations/ops-nav";

export const dynamic = "force-dynamic";

const NORTH_NAV: OpsNavItem[] = [
  { href: "/operations/north", label: "北區總覽", icon: LayoutDashboard, permissionKey: "operations-north-dashboard" },
  { href: "/operations/north/analysis", label: "北區績效分析", icon: BarChart3, permissionKey: "operations-north-dashboard" },
];

export default async function NorthDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OperationsShell
      visibleNav={NORTH_NAV}
      title="北區Dashboard"
      subtitle="台北區"
    >
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">載入中…</div>}>
        {children}
      </Suspense>
    </OperationsShell>
  );
}
