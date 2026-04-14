import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";
import type { DeletionRequestTargetType } from "@prisma/client";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  fromStoreId: z.string().optional().nullable(),
  toStoreId: z.string().optional(),
  dispatchHours: z.number().optional(),
  actualHours: z.number().optional().nullable(),
  confirmStatus: z.enum(["待確認", "已確認"]).optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.fromStoreId !== undefined) data.fromStoreId = parsed.data.fromStoreId;
    if (parsed.data.toStoreId !== undefined) data.toStoreId = parsed.data.toStoreId;
    if (parsed.data.dispatchHours !== undefined) data.dispatchHours = parsed.data.dispatchHours;
    if (parsed.data.actualHours !== undefined) data.actualHours = parsed.data.actualHours;
    if (parsed.data.confirmStatus !== undefined) data.confirmStatus = parsed.data.confirmStatus;
    if (parsed.data.startTime !== undefined) data.startTime = parsed.data.startTime;
    if (parsed.data.endTime !== undefined) data.endTime = parsed.data.endTime;
    if (parsed.data.remark !== undefined) data.remark = parsed.data.remark;

    const updated = await prisma.dispatchRecord.update({
      where: { id },
      data,
    });

    await performanceEngineService.recalculateDailyPerformance(updated.workDate);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失敗" },
      { status: 500 }
    );
  }
}

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

    const moduleKey = "delete-approve-dispatches";
    const canApprove = await hasModuleEffectivePermission(
      { id: session.roleId, key: session.roleKey },
      moduleKey,
      "write"
    );

    const existing = await prisma.dispatchRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "找不到該筆資料" }, { status: 404 });
    }

    if (canApprove) {
      const deleted = await prisma.dispatchRecord.delete({ where: { id } });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return NextResponse.json({ success: true });
    }

    const targetType: DeletionRequestTargetType = "DISPATCH_RECORD";
    const dup = await prisma.deletionRequest.findFirst({
      where: { targetType, targetId: id, status: "PENDING" },
    });
    if (dup) {
      return NextResponse.json(
        { pending: true, requestId: dup.id, message: "已有待審刪除申請" },
        { status: 202 }
      );
    }

    const created = await prisma.deletionRequest.create({
      data: {
        targetType,
        targetId: id,
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

