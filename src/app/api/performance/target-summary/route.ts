import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, endOfDayUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

/** 達標次數統計：日期區間內各門市達標天數、未達標天數、達標率、平均工效比 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const storeId = searchParams.get("storeId");
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "請提供 startDate 與 endDate (YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  const start = parseDateOnlyUTC(startDate);
  const end = endOfDayUTC(endDate);

  const [list, holidays] = await Promise.all([
    prisma.performanceDaily.findMany({
      where: {
        workDate: { gte: start, lte: end },
        versionNo: 1,
        ...(storeId ? { storeId } : {}),
        store: {
          isActive: true,
        },
      },
      include: {
        store: true,
      },
    }),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: {
          gte: start,
          lte: end,
        },
      },
    }),
  ]);

  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().slice(0, 10))
  );

  const byStore = new Map<
    string,
    { storeId: string; storeName: string; storeCode: string | null; totalDays: number; metDays: number; totalRevenue: number; totalHours: number; sumRatio: number }
  >();

  for (const p of list) {
    const dateOnly = p.workDate.toISOString().slice(0, 10);
    const isSunday = p.workDate.getDay() === 0;
    const isHoliday = holidaySet.has(dateOnly);
    if (isSunday || isHoliday) continue;

    const key = p.storeId;
    if (!byStore.has(key)) {
      byStore.set(key, {
        storeId: p.storeId,
        storeName: p.store.name,
        storeCode: p.store.code,
        totalDays: 0,
        metDays: 0,
        totalRevenue: 0,
        totalHours: 0,
        sumRatio: 0,
      });
    }
    const s = byStore.get(key)!;
    s.totalDays += 1;
    if (p.isTargetMet) s.metDays += 1;
    s.totalRevenue += Number(p.revenueAmount);
    s.totalHours += Number(p.totalWorkHours);
    s.sumRatio += Number(p.efficiencyRatio);
  }

  const result = Array.from(byStore.values()).map((s) => ({
    storeId: s.storeId,
    storeName: s.storeName,
    storeCode: s.storeCode,
    totalDays: s.totalDays,
    metDays: s.metDays,
    notMetDays: s.totalDays - s.metDays,
    metRate: s.totalDays > 0 ? s.metDays / s.totalDays : 0,
    avgEfficiencyRatio: s.totalDays > 0 ? s.sumRatio / s.totalDays : 0,
  }));

  result.sort((a, b) => b.metRate - a.metRate);
  return NextResponse.json(result);
}
