import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";

const updateSchema = z.object({
  storeId: z.string().optional(),
  reason: z.enum(["EXPIRY", "CLEANING", "INVENTORY_REGISTRATION", "OTHER"]).optional(),
  hours: z.number().min(0).optional(),
  note: z.string().optional().nullable(),
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
    if (parsed.data.storeId !== undefined) data.storeId = parsed.data.storeId;
    if (parsed.data.reason !== undefined) data.reason = parsed.data.reason;
    if (parsed.data.hours !== undefined)
      data.hours = Number.isFinite(parsed.data.hours) ? Math.round(parsed.data.hours * 100) / 100 : 0;
    if (parsed.data.note !== undefined) data.note = parsed.data.note?.trim() || null;

    const updated = await prisma.storeHourDeduction.update({
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
    const deleted = await prisma.storeHourDeduction.delete({ where: { id } });
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
