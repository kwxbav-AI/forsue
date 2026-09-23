import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  result: z.enum(["PASSED", "FAILED"]).nullable().optional(),
  hoursDeducted: z.number().positive().optional(),
  note: z.string().optional().nullable(),
});

/** PATCH /api/promotion-tracking/exam-records/[id] — 更新考核結果 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const existing = await prisma.promotionExamRecord.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "找不到考核紀錄" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "欄位錯誤", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const updated = await prisma.promotionExamRecord.update({
    where: { id: params.id },
    data: {
      ...(d.result !== undefined ? { result: d.result } : {}),
      ...(d.hoursDeducted !== undefined ? { hoursDeducted: d.hoursDeducted } : {}),
      ...(d.note !== undefined ? { note: d.note?.trim() || null } : {}),
    },
  });

  // 若改為通過，升等
  if (d.result === "PASSED" && existing.result !== "PASSED") {
    const GRADE_HOURS: Record<string, { target: string; hours: number }> = {
      "三級營業員": { target: "二級營業員", hours: 40 },
      "二級營業員": { target: "一級營業員", hours: 80 },
      "初階兼職":   { target: "進階兼職",   hours: 40 },
    };
    const next = GRADE_HOURS[updated.toGrade] ?? null;
    await prisma.employeePromotionTracking.update({
      where: { employeeId: updated.employeeId },
      data: {
        currentGrade: updated.toGrade,
        targetGrade: next?.target ?? null,
        hoursRequired: next?.hours ?? null,
      },
    });
  }

  return NextResponse.json(updated);
}

/** DELETE /api/promotion-tracking/exam-records/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.promotionExamRecord.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "刪除失敗" }, { status: 500 });
  }
}
