import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-request";
import { getEffectivePermissionsForRole } from "@/lib/effective-permissions";

export const dynamic = "force-dynamic";

/** 僅回傳「目前登入者」角色的有效權限（不可查詢其他角色）。 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const effective = await getEffectivePermissionsForRole(session.roleId, session.roleKey);
  return NextResponse.json(effective);
}
