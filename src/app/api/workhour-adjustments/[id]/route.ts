import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  workDate: z.string().optional(),
  employeeId: z.string().optional(),
  storeId: z.string().optional().nullable(),
  adjustmentType: z.enum(["STAFF_SHORTAGE", "MEETING_REVIEW", "RESERVE_STAFF", "TRIAL", "OTHER"]).optional(),
  adjustmentHours: z.number().optional(),
  reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.workhourAdjustment.update({
      where: { id },
      data: {
        ...(parsed.data.workDate && { workDate: new Date(parsed.data.workDate) }),
        ...(parsed.data.employeeId && { employeeId: parsed.data.employeeId }),
        ...(parsed.data.storeId !== undefined && { storeId: parsed.data.storeId }),
        ...(parsed.data.adjustmentType && { adjustmentType: parsed.data.adjustmentType }),
        ...(parsed.data.adjustmentHours !== undefined && {
          adjustmentHours: parsed.data.adjustmentHours,
        }),
        ...(parsed.data.reason !== undefined && { reason: parsed.data.reason }),
        ...(parsed.data.note !== undefined && { note: parsed.data.note }),
      },
      include: { employee: true },
    });

    await performanceEngineService.recalculateDailyPerformance(updated.workDate);
    return NextResponse.json(updated);
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

    const canApprove = await hasModuleEffectivePermission(
      { id: session.roleId, key: session.roleKey },
      "delete-approve-workhour-adjustments",
      "write"
    );

    if (canApprove) {
      const deleted = await prisma.workhourAdjustment.delete({
        where: { id },
      });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return NextResponse.json({ success: true });
    }

    const existing = await prisma.workhourAdjustment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "找不到該筆資料" }, { status: 404 });
    }

    const dup = await prisma.deletionRequest.findFirst({
      where: { targetType: "WORKHOUR_ADJUSTMENT", targetId: id, status: "PENDING" },
    });
    if (dup) {
      return NextResponse.json(
        {
          pending: true,
          requestId: dup.id,
          message: "已有待審刪除申請",
        },
        { status: 202 }
      );
    }

    const created = await prisma.deletionRequest.create({
      data: {
        targetType: "WORKHOUR_ADJUSTMENT",
        targetId: id,
        status: "PENDING",
        requestedByUserId: session.userId,
        requestedByUsername: session.username,
      },
    });

    return NextResponse.json(
      {
        pending: true,
        requestId: created.id,
        message: "已送出刪除申請，待核准後生效",
      },
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
