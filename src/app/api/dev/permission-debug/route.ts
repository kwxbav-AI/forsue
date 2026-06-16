import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * 開發用：診斷目前登入者的權限狀態
 * GET /api/dev/permission-debug
 */
export async function GET(request: NextRequest) {
  // 允許在任何環境執行，但需要有效 session
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { roleId, roleKey, username } = session;

  // 1. 確認 Role 紀錄
  const role = await prisma.role.findFirst({
    where: { id: roleId },
    select: { id: true, key: true, name: true },
  });

  // 2. 此 role 的所有 RolePermission
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId },
    include: {
      module: {
        select: {
          id: true,
          key: true,
          label: true,
          parentId: true,
          patterns: {
            where: { kind: "PAGE" },
            select: { pathPattern: true },
          },
        },
      },
    },
  });

  // 3. 針對 layout 檢查的四條路徑，模擬 canAccessPageDb 結果
  const checkPaths = ["/workhour-related", "/reports", "/uploads", "/data", "/settings", "/operations/dashboard"];
  const pathResults: Record<string, { matched: boolean; matchedBy?: string; canRead: boolean; canWrite: boolean }> = {};

  for (const pathname of checkPaths) {
    let found = false;
    let matchedBy = "";
    let canRead = false;
    let canWrite = false;

    for (const rp of rolePerms) {
      for (const pat of rp.module.patterns) {
        const p = String(pat.pathPattern || "");
        const matched =
          p === "/" ? pathname === "/" :
          p.endsWith("/") ? pathname.startsWith(p) :
          pathname === p;
        if (matched) {
          found = true;
          matchedBy = `${rp.module.key} (pattern: "${p}")`;
          canRead = rp.canRead;
          canWrite = rp.canWrite;
          break;
        }
      }
      if (found) break;
    }

    pathResults[pathname] = { matched: found, matchedBy: found ? matchedBy : undefined, canRead, canWrite };
  }

  // 4. 特別列出 workhour-related 和 reports 模組的完整狀態
  const focusModules = rolePerms
    .filter((rp) => ["workhour-related", "reports"].includes(rp.module.key))
    .map((rp) => ({
      key: rp.module.key,
      label: rp.module.label,
      moduleId: rp.module.id,
      parentId: rp.module.parentId,
      canRead: rp.canRead,
      canWrite: rp.canWrite,
      pagePatterns: rp.module.patterns.map((p) => p.pathPattern),
    }));

  return NextResponse.json({
    session: { username, roleId, roleKey },
    roleInDb: role ?? "NOT FOUND — roleId 在 Role 表中找不到！",
    roleIdMatch: role ? role.id === roleId : false,
    pathChecks: pathResults,
    focusModules,
    summary: {
      workhourRelatedCanRead: focusModules.find((m) => m.key === "workhour-related")?.canRead ?? "模組不存在",
      reportsCanRead: focusModules.find((m) => m.key === "reports")?.canRead ?? "模組不存在",
    },
  });
}
