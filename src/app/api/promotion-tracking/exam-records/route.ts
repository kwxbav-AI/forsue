import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  employeeId: z.string().min(1),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fromGrade: z.string().min(1),
  toGrade: z.string().min(1),
  hoursDeducted: z.number().positive(),
  result: z.enum(["PASSED", "FAILED"]).nullable().optional(),
  note: z.string().optional().nullable(),
});

/** GET /api/promotion-tracking/exam-records?employeeId=xxx */
export async function GET(request: NextRequest) {
  const employeeId = request.nextUrl.searchParams.get("employeeId") ?? undefined;
  const records = await prisma.promotionExamRecord.findMany({
    where: employeeId ? { employeeId } : undefined,
    include: { employee: { select: { name: true, employeeCode: true } } },
    orderBy: [{ examDate: "desc" }],
  });
  return NextResponse.json(records);
}

/** POST /api/promotion-tracking/exam-records — 新增一筆考核紀錄 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;

    // 確認員工有 tracking 紀錄
    const tracking = await prisma.employeePromotionTracking.findUnique({
      where: { employeeId: d.employeeId },
    });
    if (!tracking) {
      return NextResponse.json(
        { error: "找不到該員工的晉升追蹤設定" },
        { status: 404 }
      );
    }

    const record = await prisma.promotionExamRecord.create({
      data: {
        employeeId: d.employeeId,
        examDate: new Date(d.examDate),
        fromGrade: d.fromGrade,
        toGrade: d.toGrade,
        hoursDeducted: d.hoursDeducted,
        result: d.result ?? null,
        note: d.note?.trim() || null,
      },
    });

    // 若考核通過，同時更新 tracking 的 currentGrade / targetGrade
    if (d.result === "PASSED") {
      await _advanceGrade(d.employeeId, d.toGrade);
    }

    return NextResponse.json(record, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "新增失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// 升職後更新 tracking 資料
async function _advanceGrade(employeeId: string, newGrade: string) {
  const GRADE_HOURS: Record<string, { target: string; hours: number }> = {
    "三級營業員": { target: "二級營業員", hours: 40 },
    "二級營業員": { target: "一級營業員", hours: 80 },
    "初階兼職":   { target: "進階兼職",   hours: 40 },
  };
  const next = GRADE_HOURS[newGrade] ?? null;
  await prisma.employeePromotionTracking.update({
    where: { employeeId },
    data: {
      currentGrade: newGrade,
      targetGrade: next?.target ?? null,
      hoursRequired: next?.hours ?? null,
    },
  });
}
