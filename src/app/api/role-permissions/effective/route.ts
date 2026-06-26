import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-request";
import { getEffectivePermissionsForRole } from "@/lib/effective-permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 僅回傳「目前登入者」角色的有效權限（不可查詢其他角色）。 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const effective = await getEffectivePermissionsForRole(session.roleId, session.roleKey);

  // 有指派督導門市的帳號，自動注入 store-portal 所需的 page + API 權限
  const hasSupervisorStores =
    (await prisma.supervisorStore.count({ where: { supervisorId: session.userId } })) > 0;

  if (hasSupervisorStores) {
    const extraPages = ["/store-portal/", "/store-portal"];
    const extraApiRead = [
      { pathPattern: "/api/store-portal/", method: null },
      { pathPattern: "/api/operations/work-hours/", method: null },
      { pathPattern: "/api/operations/overview", method: null },
    ];
    return NextResponse.json({
      ...effective,
      allowedPagePathPatterns: [
        ...effective.allowedPagePathPatterns,
        ...extraPages.filter((p) => !effective.allowedPagePathPatterns.includes(p)),
      ],
      allowedApiReadPatterns: [
        ...effective.allowedApiReadPatterns,
        ...extraApiRead.filter(
          (e) => !effective.allowedApiReadPatterns.some((x) => x.pathPattern === e.pathPattern)
        ),
      ],
    });
  }

  return NextResponse.json(effective);
}
