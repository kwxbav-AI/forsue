import { Suspense } from "react";
import { NorthDashboardShell } from "@/components/operations/north-dashboard-shell";

export const dynamic = "force-dynamic";

export default async function NorthDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NorthDashboardShell>
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">載入中…</div>}>
        {children}
      </Suspense>
    </NorthDashboardShell>
  );
}
