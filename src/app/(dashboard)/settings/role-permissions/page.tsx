import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth-config";
import RolePermissionsAdmin from "./role-permissions-admin";

export default async function RolePermissionsPage() {
  const authOn = isAuthEnabled();
  const session = await getServerSession();

  // 管理頁只給 ADMIN；避免 Editor 進來後以為能改
  if (authOn && (!session || session.role !== "ADMIN")) {
    redirect("/forbidden");
  }

  return <RolePermissionsAdmin />;
}

