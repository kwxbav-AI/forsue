import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, formatDateOnly } from "@/lib/date";

export const dynamic = "force-dynamic";

/** 選定區間內（含起訖）的「日曆日」，逐日 UTC，排除週日與假日後的天數 — 作為總天數分母 */
function countWorkingDaysInRangeUTC(
  startYmd: string,
  endYmd: string,
  holidayYmdSet: Set<string>
): number {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    if (d.getUTCDay() === 0) continue;
    if (holidayYmdSet.has(ymd)) continue;
    n++;
  }
  return n;
}

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
  const end = parseDateOnlyUTC(endDate);

  const [list, holidays] = await Promise.all([
    prisma.performanceDaily.findMany({
      where: {
        workDate: { gte: start, lte: end },
        versionNo: 1,
        ...(storeId ? { storeId } : {}),
        store: {
          isActive: true,
          hideInReports: false as any,
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

  const holidaySet = new Set(holidays.map((h) => formatDateOnly(h.date)));

  const workingDaysInPeriod = countWorkingDaysInRangeUTC(startDate, endDate, holidaySet);

  const byStore = new Map<
    string,
    {
      storeId: string;
      storeName: string;
      storeCode: string | null;
      metDays: number;
      dataDays: number;
      totalRevenue: number;
      totalHours: number;
      sumRatio: number;
    }
  >();

  for (const p of list) {
    const dateOnly = formatDateOnly(p.workDate);
    const isSunday = p.workDate.getUTCDay() === 0;
    const isHoliday = holidaySet.has(dateOnly);
    if (isSunday || isHoliday) continue;

    const key = p.storeId;
    if (!byStore.has(key)) {
      byStore.set(key, {
        storeId: p.storeId,
        storeName: p.store.name,
        storeCode: p.store.code,
        metDays: 0,
        dataDays: 0,
        totalRevenue: 0,
        totalHours: 0,
        sumRatio: 0,
      });
    }
    const s = byStore.get(key)!;
    s.dataDays += 1;
    if (p.isTargetMet) s.metDays += 1;
    s.totalRevenue += Number(p.revenueAmount);
    s.totalHours += Number(p.totalWorkHours);
    s.sumRatio += Number(p.efficiencyRatio);
  }

  const result = Array.from(byStore.values()).map((s) => ({
    storeId: s.storeId,
    storeName: s.storeName,
    storeCode: s.storeCode,
    totalDays: workingDaysInPeriod,
    metDays: s.metDays,
    notMetDays: workingDaysInPeriod - s.metDays,
    metRate: workingDaysInPeriod > 0 ? s.metDays / workingDaysInPeriod : 0,
    avgEfficiencyRatio: s.dataDays > 0 ? s.sumRatio / s.dataDays : 0,
  }));

  result.sort((a, b) => b.metRate - a.metRate);
  return NextResponse.json(result);
}
