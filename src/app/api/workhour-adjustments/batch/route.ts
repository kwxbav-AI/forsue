import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay } from "@/lib/date";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { z } from "zod";

const bodySchema = z.object({
  workDate: z.string(),
  adjustmentType: z.enum(["MANAGER_MEETING", "PROMOTION_REVIEW", "OTHER"]),
  adjustmentHours: z.number(), // 扣除時數（正數），儲存時轉為負數
  employeeIds: z.array(z.string()).min(1),
});

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
    const { workDate, adjustmentType, adjustmentHours, employeeIds } = parsed.data;
    const d = toStartOfDay(workDate);
    const hours = Number(adjustmentHours);
    const value = Number.isFinite(hours) ? Math.round(hours * 100) / 100 : 0;
    const adjustmentHoursValue = -Math.abs(value); // 扣抵為負數

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, isActive: true },
      select: { id: true, defaultStoreId: true },
    });
    const idSet = new Set(employees.map((e) => e.id));
    const validIds = employeeIds.filter((id) => idSet.has(id));

    const created = await prisma.$transaction(
      validIds.map((employeeId) => {
        const emp = employees.find((e) => e.id === employeeId);
        return prisma.workhourAdjustment.create({
          data: {
            workDate: d,
            employeeId,
            storeId: emp?.defaultStoreId ?? null,
            adjustmentType,
            adjustmentHours: adjustmentHoursValue,
            reason: null,
            note: null,
          },
        });
      })
    );

    await performanceEngineService.recalculateDailyPerformance(d);

    return NextResponse.json({
      success: true,
      createdCount: created.length,
      skipped: employeeIds.length - validIds.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "批次新增失敗",
      },
      { status: 500 }
    );
  }
}
