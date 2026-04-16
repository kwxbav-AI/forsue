import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth-request";
import { requireApiAccess } from "@/lib/api-access";
import { performDeletionForTarget } from "@/lib/deletion-request-service";
import { targetTypeFromSegment } from "../../_shared";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { segment: string; requestId: string } }
) {
  const session = await getSessionFromRequest(req);
  const denied = await requireApiAccess(session, req);
  if (denied) return denied;
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const pathTargetType = targetTypeFromSegment(params.segment);
  if (!pathTargetType) {
    return NextResponse.json({ error: "不支援的類型" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "無效的 JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }

  const { action, reason } = parsed.data;
  const requestId = params.requestId;

  const row = await prisma.deletionRequest.findUnique({
    where: { id: requestId },
  });
  if (!row) {
    return NextResponse.json({ error: "找不到申請" }, { status: 404 });
  }
  if (row.targetType !== pathTargetType) {
    return NextResponse.json({ error: "申請類型與路徑不符" }, { status: 400 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "此申請已處理" }, { status: 409 });
  }

  if (action === "reject") {
    await prisma.deletionRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reason: reason?.trim() || row.reason,
        reviewedByUsername: session.username,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  try {
    await performDeletionForTarget(row.targetType, row.targetId, session.username);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "執行刪除失敗";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await prisma.deletionRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      reason: reason?.trim() || row.reason,
      reviewedByUsername: session.username,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, status: "APPROVED" });
}
