import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-request";
import { USER_ROLE_LABELS } from "@/lib/permissions";
import { canAccessApiDb, hasModuleEffectivePermission } from "@/lib/permissions-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const role = session.role;
  const [
    canViewStoreChangeLogs,
    canApproveDeleteContentEntries,
    canApproveDeleteWorkhourAdjustments,
    canApproveDeleteStores,
    canApproveDeleteStoreHourDeductions,
    canApproveDeleteDispatches,
    canReadPendingContentEntries,
    canReadPendingWorkhourAdjustments,
    canReadPendingStores,
    canReadPendingStoreHourDeductions,
    canReadPendingDispatches,
  ] = await Promise.all([
    canAccessApiDb(role, "/api/stores/_/change-logs", "GET"),
    hasModuleEffectivePermission(role, "delete-approve-content-entries", "write"),
    hasModuleEffectivePermission(role, "delete-approve-workhour-adjustments", "write"),
    hasModuleEffectivePermission(role, "delete-approve-stores", "write"),
    hasModuleEffectivePermission(role, "delete-approve-store-hour-deductions", "write"),
    hasModuleEffectivePermission(role, "delete-approve-dispatches", "write"),
    hasModuleEffectivePermission(role, "delete-approve-content-entries", "read"),
    hasModuleEffectivePermission(role, "delete-approve-workhour-adjustments", "read"),
    hasModuleEffectivePermission(role, "delete-approve-stores", "read"),
    hasModuleEffectivePermission(role, "delete-approve-store-hour-deductions", "read"),
    hasModuleEffectivePermission(role, "delete-approve-dispatches", "read"),
  ]);

  return NextResponse.json({
    user: {
      username: session.username,
      role: session.role,
      roleLabel: USER_ROLE_LABELS[session.role],
      canViewStoreChangeLogs,
      canApproveDeleteContentEntries,
      canApproveDeleteWorkhourAdjustments,
      canApproveDeleteStores,
      canApproveDeleteStoreHourDeductions,
      canApproveDeleteDispatches,
      canReadPendingContentEntries,
      canReadPendingWorkhourAdjustments,
      canReadPendingStores,
      canReadPendingStoreHourDeductions,
      canReadPendingDispatches,
    },
  });
}
