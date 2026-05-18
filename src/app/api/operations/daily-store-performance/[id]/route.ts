import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDateOnlyUTC } from "@/lib/date";
import { serializeDailyStorePerformance } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1).optional(),
  date: z.string().optional(),
  salesAmount: z.number().nonnegative().optional(),
  customerCount: z.number().int().nonnegative().optional(),
  avgOrderValue: z.number().nonnegative().optional().nullable(),
  totalLaborHours: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  leaveHours: z.number().nonnegative().optional(),
  weather: z.string().optional().nullable(),
  eventNote: z.string().optional().nullable(),
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
    const updated = await prisma.dailyStorePerformance.update({
      where: { id: params.id },
      data: {
        ...(d.storeId !== undefined ? { storeId: d.storeId } : {}),
        ...(d.date !== undefined ? { date: parseDateOnlyUTC(d.date) } : {}),
        ...(d.salesAmount !== undefined ? { salesAmount: d.salesAmount } : {}),
        ...(d.customerCount !== undefined ? { customerCount: d.customerCount } : {}),
        ...(d.avgOrderValue !== undefined ? { avgOrderValue: d.avgOrderValue } : {}),
        ...(d.totalLaborHours !== undefined ? { totalLaborHours: d.totalLaborHours } : {}),
        ...(d.overtimeHours !== undefined ? { overtimeHours: d.overtimeHours } : {}),
        ...(d.leaveHours !== undefined ? { leaveHours: d.leaveHours } : {}),
        ...(d.weather !== undefined ? { weather: d.weather?.trim() || null } : {}),
        ...(d.eventNote !== undefined ? { eventNote: d.eventNote?.trim() || null } : {}),
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeDailyStorePerformance(updated));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "更新每日績效失敗";
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
    await prisma.dailyStorePerformance.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "刪除每日績效失敗";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "找不到紀錄" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
