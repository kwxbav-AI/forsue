import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly } from "@/lib/date";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import type { DeletionRequestTargetType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "未登入" }, { status: 401 });
    }

    const canApprove = await hasModuleEffectivePermission(
      { id: session.roleId, key: session.roleKey },
      "delete-approve-revenue-records",
      "write"
    );

    const existing = await prisma.revenueRecord.findUnique({
      where: { id },
      include: { store: { select: { name: true, code: true, department: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "找不到該筆資料" }, { status: 404 });
    }

    if (canApprove) {
      const deleted = await prisma.revenueRecord.delete({ where: { id } });
      await performanceEngineService.recalculateDailyPerformance(deleted.revenueDate);
      return NextResponse.json({ success: true });
    }

    const targetType: DeletionRequestTargetType = "REVENUE_RECORD";
    const dup = await prisma.deletionRequest.findFirst({
      where: { targetType, targetId: id, status: "PENDING" },
    });
    if (dup) {
      return NextResponse.json(
        { pending: true, requestId: dup.id, message: "已有待審刪除申請" },
        { status: 202 }
      );
    }

    const code = existing.store.code ? `（${existing.store.code}）` : "";
    const dept = existing.store.department ? `｜${existing.store.department}` : "";
    const checkout = existing.checkoutNo ? `｜單號 ${existing.checkoutNo}` : "";
    const targetSummary = `${formatDateOnly(existing.revenueDate)}｜${existing.store.name}${code}${dept}｜營收 ${Number(existing.revenueAmount).toLocaleString("zh-TW")}${checkout}`;

    const created = await prisma.deletionRequest.create({
      data: {
        targetType,
        targetId: id,
        targetSummary,
        status: "PENDING",
        requestedByUserId: session.userId,
        requestedByUsername: session.username,
      },
    });

    return NextResponse.json(
      { pending: true, requestId: created.id, message: "已送出刪除申請，待核准後生效" },
      { status: 202 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}
