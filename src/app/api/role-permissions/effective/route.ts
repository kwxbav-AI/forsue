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

  // 有指派督導門市、或帳號本身有綁定門市（門市人員），自動注入 store-portal 所需的 page + API 權限
  const [hasSupervisorStores, hasRetailStore] = await Promise.all([
    prisma.supervisorStore.count({ where: { supervisorId: session.userId } }).then((c) => c > 0),
    prisma.appUser.count({ where: { id: session.userId, retailStoreId: { not: null } } }).then((c) => c > 0),
  ]);

  // 若角色已有任何 /store-portal 頁面權限（管理員透過 RolePermission 設定），
  // 或該帳號有督導門市指派，或帳號有綁定門市，補齊整個 store-portal prefix 及必要 API
  const hasStorePortalPage = effective.allowedPagePathPatterns.some((p) =>
    p.startsWith("/store-portal")
  );

  if (hasSupervisorStores || hasRetailStore || hasStorePortalPage) {
    const extraPages = ["/store-portal/", "/store-portal"];
    const extraApiRead = [
      { pathPattern: "/api/store-portal/", method: null },
      { pathPattern: "/api/operations/work-hours/", method: null },
      { pathPattern: "/api/operations/overview", method: null },
      { pathPattern: "/api/operations/dashboard", method: null },
      { pathPattern: "/api/reports/store-target-card", method: null },
      { pathPattern: "/api/reports/attendance", method: null },
      { pathPattern: "/api/dispatches", method: null },
      { pathPattern: "/api/dispatches/", method: null },
      { pathPattern: "/api/content-entries", method: null },
      { pathPattern: "/api/content-entries/", method: null },
      { pathPattern: "/api/store-hour-deductions", method: null },
      { pathPattern: "/api/store-hour-deductions/", method: null },
    ];
    // 有門市存取權（督導或門市人員）的帳號，同步開放 store-portal 寫入操作
    const extraApiWrite = [
      { pathPattern: "/api/dispatches", method: null },
      { pathPattern: "/api/dispatches/", method: null },
      { pathPattern: "/api/content-entries", method: null },
      { pathPattern: "/api/content-entries/", method: null },
      { pathPattern: "/api/store-hour-deductions", method: null },
      { pathPattern: "/api/store-hour-deductions/", method: null },
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
      allowedApiWritePatterns: [
        ...effective.allowedApiWritePatterns,
        ...extraApiWrite.filter(
          (e) => !effective.allowedApiWritePatterns.some((x) => x.pathPattern === e.pathPattern)
        ),
      ],
    });
  }

  return NextResponse.json(effective);
}
