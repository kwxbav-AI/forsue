import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
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

