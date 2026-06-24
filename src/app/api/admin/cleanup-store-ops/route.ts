import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";

// 一次性清除 store-ops PermissionModule，執行後請刪除此檔案
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.roleKey !== "ADMIN") {
    return NextResponse.json({ error: "僅限 ADMIN" }, { status: 403 });
  }

  const deleted = await prisma.permissionModule.deleteMany({
    where: {
      OR: [
        { groupKey: "店務管理" },
        { key: { startsWith: "store-ops" } },
      ],
    },
  });

  return NextResponse.json({ deleted: deleted.count });
}
