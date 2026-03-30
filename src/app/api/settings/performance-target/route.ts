import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  targetValue: z.number(),
  effectiveStartDate: z.string(),
  effectiveEndDate: z.string().optional().nullable(),
});

export async function GET() {
  const list = await prisma.performanceTargetSetting.findMany({
    orderBy: { effectiveStartDate: "desc" },
  });
  const active = list.find((s) => s.isActive);
  return NextResponse.json({
    active: active
      ? {
          id: active.id,
          targetValue: Number(active.targetValue),
          effectiveStartDate: active.effectiveStartDate.toISOString().slice(0, 10),
          effectiveEndDate: active.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
        }
      : null,
    history: list.map((s) => ({
      id: s.id,
      targetValue: Number(s.targetValue),
      effectiveStartDate: s.effectiveStartDate.toISOString().slice(0, 10),
      effectiveEndDate: s.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
      isActive: s.isActive,
      updatedBy: s.updatedBy,
      createdAt: s.createdAt.toISOString(),
    })),
  });
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
    const { targetValue, effectiveStartDate, effectiveEndDate } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.performanceTargetSetting.updateMany({
        data: { isActive: false },
        where: { isActive: true },
      });
      await tx.performanceTargetSetting.create({
        data: {
          targetValue,
          effectiveStartDate: new Date(effectiveStartDate),
          effectiveEndDate: effectiveEndDate ? new Date(effectiveEndDate) : null,
          isActive: true,
        },
      });
    });

    const active = await prisma.performanceTargetSetting.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      active
        ? {
            id: active.id,
            targetValue: Number(active.targetValue),
            effectiveStartDate: active.effectiveStartDate.toISOString().slice(0, 10),
            effectiveEndDate: active.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
          }
        : null
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "設定失敗" },
      { status: 500 }
    );
  }
}
