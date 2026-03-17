import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const deleted = await prisma.dispatchRecord.delete({ where: { id } });
    await performanceEngineService.recalculateDailyPerformance(deleted.workDate);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刪除失敗" },
      { status: 500 }
    );
  }
}

