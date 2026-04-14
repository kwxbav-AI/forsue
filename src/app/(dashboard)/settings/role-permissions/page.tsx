import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth-config";
import { canAccessPageDb } from "@/lib/permissions-db";
import RolePermissionsAdmin from "./role-permissions-admin";

export default async function RolePermissionsPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();

  if (
    authOn &&
    (!session ||
      !(await canAccessPageDb(
        { id: session.roleId, key: session.roleKey },
        "/settings/role-permissions"
      )))
  ) {
    redirect("/forbidden");
  }

  return <RolePermissionsAdmin />;
}

