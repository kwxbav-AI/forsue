import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";
import { targetTypeFromSegment } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { segment: string } }
) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;

  const targetType = targetTypeFromSegment(params.segment);
  if (!targetType) {
    return NextResponse.json({ error: "不支援的類型" }, { status: 404 });
  }

  const rows = await prisma.deletionRequest.findMany({
    where: { targetType, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    targetType,
    requests: rows,
  });
}
