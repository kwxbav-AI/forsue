import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { parseDateOnlyUTC } from "@/lib/date";
import { serializeDailyStorePerformance } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1),
  date: z.string(),
  salesAmount: z.number().nonnegative().optional(),
  customerCount: z.number().int().nonnegative().optional(),
  avgOrderValue: z.number().nonnegative().optional().nullable(),
  totalLaborHours: z.number().nonnegative().optional(),
  overtimeHours: z.number().nonnegative().optional(),
  leaveHours: z.number().nonnegative().optional(),
  weather: z.string().optional().nullable(),
  eventNote: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") ?? undefined;
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");

  const list = await prisma.dailyStorePerformance.findMany({
    where: {
      ...(storeId ? { storeId } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: parseDateOnlyUTC(startDate) } : {}),
              ...(endDate ? { lte: parseDateOnlyUTC(endDate) } : {}),
            },
          }
        : {}),
    },
    include: { store: { select: { storeName: true } } },
    orderBy: [{ date: "desc" }, { store: { storeName: "asc" } }],
    take: 500,
  });
  return NextResponse.json(list.map(serializeDailyStorePerformance));
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
    const created = await prisma.dailyStorePerformance.create({
      data: {
        storeId: d.storeId,
        date: parseDateOnlyUTC(d.date),
        salesAmount: d.salesAmount ?? 0,
        customerCount: d.customerCount ?? 0,
        avgOrderValue: d.avgOrderValue ?? null,
        totalLaborHours: d.totalLaborHours ?? 0,
        overtimeHours: d.overtimeHours ?? 0,
        leaveHours: d.leaveHours ?? 0,
        weather: d.weather?.trim() || null,
        eventNote: d.eventNote?.trim() || null,
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeDailyStorePerformance(created), { status: 201 });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "新增每日績效失敗";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "此門市在該日期已有紀錄" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
