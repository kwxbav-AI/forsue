import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import {
  buildWeeksForMonth,
  countWorkingDaysInRangeUTC,
  monthStartEndYmd,
  parseMonthParam,
} from "@/lib/month-working-calendar";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";

export const dynamic = "force-dynamic";

type WeekRange = {
  index: number;
  startYmd: string;
  endYmd: string;
  workingDays: number;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "請提供 month (YYYY-MM)" }, { status: 400 });
  }
  const parsed = parseMonthParam(month);
  if (!parsed) {
    return NextResponse.json({ error: "month 格式錯誤，請使用 YYYY-MM" }, { status: 400 });
  }

  const { startYmd, endYmd } = monthStartEndYmd(parsed.year, parsed.month);

  const { weeks: weekRangesRaw, dateToWeekIndex } = buildWeeksForMonth(startYmd, endYmd);
  if (weekRangesRaw.length === 0) {
    return NextResponse.json({ month, startDate: startYmd, endDate: endYmd, weeks: [], stores: [] });
  }

  const [stores, filterStores, holidays] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true, hideInReports: false as any },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    listPerformanceStoresForFilter(),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: {
          gte: parseDateOnlyUTC(startYmd),
          lte: parseDateOnlyUTC(endYmd),
        },
      },
      select: { date: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => formatDateOnly(h.date)));
  const regionById = new Map(filterStores.map((s) => [s.id, s.region]));

  const weeks: WeekRange[] = weekRangesRaw.map((w) => ({
    ...w,
    workingDays: countWorkingDaysInRangeUTC(w.startYmd, w.endYmd, holidaySet),
  }));

  const byStoreId = new Map<
    string,
    {
      storeId: string;
      storeName: string;
      storeCode: string | null;
      region: string | null;
      byWeek: { metDays: number; exceedDays: number; total: number }[];
    }
  >();

  for (const s of stores) {
    byStoreId.set(s.id, {
      storeId: s.id,
      storeName: s.name,
      storeCode: s.code ?? null,
      region: regionById.get(s.id) ?? null,
      byWeek: weeks.map(() => ({ metDays: 0, exceedDays: 0, total: 0 })),
    });
  }

  const list = await prisma.performanceDaily.findMany({
    where: {
      workDate: {
        gte: parseDateOnlyUTC(startYmd),
        lte: parseDateOnlyUTC(endYmd),
      },
      versionNo: 1,
      store: { isActive: true, hideInReports: false as any },
    },
    select: {
      storeId: true,
      workDate: true,
      isTargetMet: true,
      efficiencyRatio: true,
    },
  });

  for (const p of list) {
    const ymd = formatDateOnly(p.workDate);
    const isSunday = p.workDate.getUTCDay() === 0;
    const isSaturday = p.workDate.getUTCDay() === 6;
    if (isSunday) continue;
    if (holidaySet.has(ymd)) continue;

    const weekIdx0 = dateToWeekIndex.get(ymd);
    if (weekIdx0 == null) continue;

    const row = byStoreId.get(p.storeId);
    if (!row) continue;

    const exceed = !isSaturday && Number(p.efficiencyRatio) >= 6000;
    if (exceed) row.byWeek[weekIdx0].exceedDays += 1;
    else if (p.isTargetMet) row.byWeek[weekIdx0].metDays += 1;
  }

  for (const row of byStoreId.values()) {
    for (const w of row.byWeek) w.total = w.metDays + w.exceedDays;
  }

  return NextResponse.json({
    month,
    startDate: startYmd,
    endDate: endYmd,
    weeks,
    stores: Array.from(byStoreId.values()),
  });
}
