import { getServerSession } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth-config";
import { getEffectivePermissionsForRole } from "@/lib/effective-permissions";
import { OperationsLayoutClient } from "./operations-layout-client";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authEnabled = isAuthEnabled();
  const session = await getServerSession();
  const effective = session
    ? await getEffectivePermissionsForRole(session.roleId, session.roleKey)
    : null;

  return (
    <OperationsLayoutClient
      authEnabled={authEnabled}
      initialIsFullAccess={effective?.isFullAccess ?? false}
      initialRoleKey={effective?.roleKey ?? session?.roleKey ?? ""}
      initialRoleName={session?.roleName}
      initialUsername={session?.username}
      initialAllowedModuleKeys={effective?.allowedModuleKeys ?? []}
    >
      {children}
    </OperationsLayoutClient>
  );
}
