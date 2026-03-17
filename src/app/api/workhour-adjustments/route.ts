import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay } from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";

const bodySchema = z.object({
  workDate: z.string(),
  employeeId: z.string(),
  storeId: z.string().optional().nullable(),
  adjustmentType: z.enum(["STAFF_SHORTAGE", "MEETING_REVIEW", "RESERVE_STAFF", "TRIAL", "MANAGER_MEETING", "PROMOTION_REVIEW", "OTHER"]),
  adjustmentHours: z.number(),
  reason: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const storeId = searchParams.get("storeId");
  const employeeId = searchParams.get("employeeId");
  if (!date) {
    return NextResponse.json({ error: "請提供 date (YYYY-MM-DD)" }, { status: 400 });
  }
  const workDate = toStartOfDay(date);
  const where: { workDate: Date; storeId?: string; employeeId?: string } = { workDate };
  if (storeId) where.storeId = storeId;
  if (employeeId) where.employeeId = employeeId;

  const list = await prisma.workhourAdjustment.findMany({
    where,
    include: { employee: true },
    orderBy: [{ employeeId: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workDate, employeeId, storeId, adjustmentType, adjustmentHours, reason, note } =
      parsed.data;
    const d = toStartOfDay(workDate);

    const storeIdValue = storeId && String(storeId).trim() !== "" ? storeId : null;
    const hours = Number(adjustmentHours);
    const adjustmentHoursValue = Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0;

    const created = await prisma.workhourAdjustment.create({
      data: {
        workDate: d,
        employeeId,
        storeId: storeIdValue,
        adjustmentType,
        adjustmentHours: adjustmentHoursValue,
        reason: reason ?? null,
        note: note ?? null,
      },
      include: { employee: true },
    });

    await performanceEngineService.recalculateDailyPerformance(d);
    return NextResponse.json(created);
  } catch (e) {
    console.error(e);
    const message =
      e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "新增失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
