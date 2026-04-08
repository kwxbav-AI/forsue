import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";

export const dynamic = "force-dynamic";

function requireAdmin(session: Awaited<ReturnType<typeof getSessionFromRequest>>) {
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  const denied = requireAdmin(session);
  if (denied) return denied;

  const storeId = params.id;
  const logs = await prisma.storeChangeLog.findMany({
    where: { storeId },
    orderBy: { changedAt: "desc" },
    take: 200,
    select: {
      id: true,
      storeId: true,
      action: true,
      changedBy: true,
      before: true,
      after: true,
      changedAt: true,
    },
  });

  return NextResponse.json({ logs });
}

