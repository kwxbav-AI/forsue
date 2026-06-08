import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";
import { getSessionFromRequest } from "@/lib/auth-request";
import { hasModuleEffectivePermission } from "@/lib/permissions-db";
import type { DeletionRequestTargetType } from "@prisma/client";
import { resolvePendingDeletionRequests } from "@/lib/deletion-request-service";

export const dynamic = "force-dynamic";

function fmtDateOnly(d: Date): string {
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

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

    // 後勤支援門市：已確認時必填調度工時（actualHours）
    const incomingRemark = parsed.data.remark;
    const incomingConfirm = parsed.data.confirmStatus;
    const incomingActual = parsed.data.actualHours;
    const isBackoffice =
      typeof incomingRemark === "string" && incomingRemark.trim().startsWith("後勤支援門市");
    if (isBackoffice && incomingConfirm === "已確認" && (incomingActual == null || incomingActual <= 0)) {
      return NextResponse.json(
        { error: "後勤支援門市在「已確認」時必須填寫調度工時（> 0）" },
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

    const existing = await prisma.dispatchRecord.findUnique({
      where: { id },
      select: {
        id: true,
        workDate: true,
        dispatchHours: true,
        actualHours: true,
        employee: { select: { employeeCode: true, name: true } },
        fromStoreId: true,
        toStoreId: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "找不到該筆資料" }, { status: 404 });
    }

    if (canApprove) {
      const deleted = await prisma.dispatchRecord.delete({ where: { id } });
      await resolvePendingDeletionRequests("DISPATCH_RECORD", id, {
        reviewedByUsername: session.username,
        reason: "管理員直接刪除",
      });
      await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
      return NextResponse.json({ success: true });
    }

    const targetType: DeletionRequestTargetType = "DISPATCH_RECORD";
    const dup = await prisma.deletionRequest.findFirst({
      where: { targetType, targetId: id, status: "PENDING" },
    });
    if (dup) {
      return NextResponse.json(
        { pending: true, requestId: dup.id, message: "已有待審刪除申請（申請中）" },
        { status: 202 }
      );
    }

    const storeIds = Array.from(
      new Set([existing.fromStoreId, existing.toStoreId].filter(Boolean) as string[])
    );
    const stores = await prisma.store.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, name: true, code: true },
    });
    const storeMap = new Map<string, { name: string; code: string | null }>(
      stores.map((s) => [s.id, { name: s.name, code: s.code }])
    );
    const from = existing.fromStoreId ? storeMap.get(existing.fromStoreId) : null;
    const to = storeMap.get(existing.toStoreId);
    const fromLabel = from ? `${from.name}${from.code ? `（${from.code}）` : ""}` : "—";
    const toLabel = to ? `${to.name}${to.code ? `（${to.code}）` : ""}` : existing.toStoreId;
    const h = existing.actualHours != null ? Number(existing.actualHours) : Number(existing.dispatchHours);
    const targetSummary = `${fmtDateOnly(existing.workDate)}｜${existing.employee.employeeCode} ${existing.employee.name}｜${fromLabel} → ${toLabel}｜${h} 小時`;

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
    // 若 DB 已加上 pending unique index，並發連點可能會撞到 unique
    // 這裡把它視為「已有待審申請」的正常情境
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { pending: true, requestId: null, message: "已有待審刪除申請（申請中）" },
        { status: 202 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}

