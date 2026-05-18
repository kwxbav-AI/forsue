import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDateOnlyUTC } from "@/lib/date";
import { serializeStaffSchedule } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1),
  staffName: z.string().min(1),
  workDate: z.string(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  position: z.string().optional().nullable(),
  isManager: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") ?? undefined;
  const workDate = request.nextUrl.searchParams.get("workDate");

  const list = await prisma.staffSchedule.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(workDate ? { workDate: parseDateOnlyUTC(workDate) } : {}),
    },
    include: { store: { select: { storeName: true } } },
    orderBy: [{ workDate: "desc" }, { startTime: "asc" }],
    take: 300,
  });
  return NextResponse.json(list.map(serializeStaffSchedule));
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
    const d = parsed.data;
    const created = await prisma.staffSchedule.create({
      data: {
        storeId: d.storeId,
        staffName: d.staffName.trim(),
        workDate: parseDateOnlyUTC(d.workDate),
        startTime: d.startTime.trim(),
        endTime: d.endTime.trim(),
        position: d.position?.trim() || null,
        isManager: d.isManager ?? false,
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeStaffSchedule(created), { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增排班失敗" },
      { status: 500 }
    );
  }
}
