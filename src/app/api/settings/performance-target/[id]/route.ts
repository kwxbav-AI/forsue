import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  targetValue: z.number().optional(),
  effectiveStartDate: z.string().optional(),
  effectiveEndDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
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

    const data: {
      targetValue?: number;
      effectiveStartDate?: Date;
      effectiveEndDate?: Date | null;
      isActive?: boolean;
    } = {};
    if (parsed.data.targetValue !== undefined) data.targetValue = parsed.data.targetValue;
    if (parsed.data.effectiveStartDate !== undefined)
      data.effectiveStartDate = new Date(parsed.data.effectiveStartDate);
    if (parsed.data.effectiveEndDate !== undefined)
      data.effectiveEndDate = parsed.data.effectiveEndDate ? new Date(parsed.data.effectiveEndDate) : null;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

    if (parsed.data.isActive === true) {
      await prisma.performanceTargetSetting.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      });
    }

    const updated = await prisma.performanceTargetSetting.update({
      where: { id },
      data,
    });
    return NextResponse.json({
      id: updated.id,
      targetValue: Number(updated.targetValue),
      effectiveStartDate: updated.effectiveStartDate.toISOString().slice(0, 10),
      effectiveEndDate: updated.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
      isActive: updated.isActive,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "更新失敗" },
      { status: 500 }
    );
  }
}
