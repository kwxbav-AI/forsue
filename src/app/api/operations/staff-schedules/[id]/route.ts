import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDateOnlyUTC } from "@/lib/date";
import { serializeStaffSchedule } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1).optional(),
  staffName: z.string().min(1).optional(),
  workDate: z.string().optional(),
  startTime: z.string().min(1).optional(),
  endTime: z.string().min(1).optional(),
  position: z.string().optional().nullable(),
  isManager: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const updated = await prisma.staffSchedule.update({
      where: { id: params.id },
      data: {
        ...(d.storeId !== undefined ? { storeId: d.storeId } : {}),
        ...(d.staffName !== undefined ? { staffName: d.staffName.trim() } : {}),
        ...(d.workDate !== undefined ? { workDate: parseDateOnlyUTC(d.workDate) } : {}),
        ...(d.startTime !== undefined ? { startTime: d.startTime.trim() } : {}),
        ...(d.endTime !== undefined ? { endTime: d.endTime.trim() } : {}),
        ...(d.position !== undefined ? { position: d.position?.trim() || null } : {}),
        ...(d.isManager !== undefined ? { isManager: d.isManager } : {}),
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeStaffSchedule(updated));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "更新排班失敗";
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "找不到紀錄" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.staffSchedule.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "刪除排班失敗";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "找不到紀錄" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
