import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

type WeekRange = {
  index: number; // 1-based for display
  startYmd: string;
  endYmd: string;
  workingDays: number;
};

function parseMonthParam(month: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(mm)) return null;
  if (mm < 1 || mm > 12) return null;
  return { year, month: mm };
}

/** 選定區間內（含起訖）的「日曆日」，逐日 UTC，排除週日與假日後的天數 */
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

function buildWeeksForMonth(startYmd: string, endYmd: string): { weeks: Omit<WeekRange, "workingDays">[]; dateToWeekIndex: Map<string, number> } {
  const start = parseDateOnlyUTC(startYmd);
  const end = parseDateOnlyUTC(endYmd);

  const weeks: { index: number; startYmd: string; endYmd: string }[] = [];
  const dateToWeekIndex = new Map<string, number>(); // ymd -> 0-based week index

  let currentStart: string | null = null;
  let currentEnd: string | null = null;

  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    const isSunday = d.getUTCDay() === 0;
    if (isSunday) {
      if (currentStart && currentEnd) {
        const idx0 = weeks.length;
        weeks.push({ index: idx0 + 1, startYmd: currentStart, endYmd: currentEnd });
        // map dates in this segment (excluding Sundays by construction)
        for (let day = currentStart; day <= currentEnd; day = addCalendarDaysUTC(day, 1)) {
          const dd = parseDateOnlyUTC(day);
          if (dd.getUTCDay() === 0) continue;
          dateToWeekIndex.set(day, idx0);
        }
      }
      currentStart = null;
      currentEnd = null;
      continue;
    }

    if (!currentStart) currentStart = ymd;
    currentEnd = ymd;
  }

  if (currentStart && currentEnd) {
    const idx0 = weeks.length;
    weeks.push({ index: idx0 + 1, startYmd: currentStart, endYmd: currentEnd });
    for (let day = currentStart; day <= currentEnd; day = addCalendarDaysUTC(day, 1)) {
      const dd = parseDateOnlyUTC(day);
      if (dd.getUTCDay() === 0) continue;
      dateToWeekIndex.set(day, idx0);
    }
  }

  return { weeks, dateToWeekIndex };
}

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

  const startYmd = `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0, 0, 0, 0, 0)); // month is 1-based; day 0 = last day of previous month
  const endYmd = formatDateOnly(lastDay);

  const { weeks: weekRangesRaw, dateToWeekIndex } = buildWeeksForMonth(startYmd, endYmd);
  if (weekRangesRaw.length === 0) {
    return NextResponse.json({ month, startDate: startYmd, endDate: endYmd, weeks: [], stores: [] });
  }

  const [stores, holidays] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true, hideInReports: false as any },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
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

  const weeks: WeekRange[] = weekRangesRaw.map((w) => ({
    ...w,
    workingDays: countWorkingDaysInRangeUTC(w.startYmd, w.endYmd, holidaySet),
  }));

  // init per-store stats
  const byStoreId = new Map<
    string,
    {
      storeId: string;
      storeName: string;
      storeCode: string | null;
      byWeek: { metDays: number; exceedDays: number; total: number }[];
    }
  >();

  for (const s of stores) {
    byStoreId.set(s.id, {
      storeId: s.id,
      storeName: s.name,
      storeCode: s.code ?? null,
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
    if (isSunday) continue;
    if (holidaySet.has(ymd)) continue;

    const weekIdx0 = dateToWeekIndex.get(ymd);
    if (weekIdx0 == null) continue;

    const row = byStoreId.get(p.storeId);
    if (!row) continue;

    const exceed = Number(p.efficiencyRatio) >= 6000;
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

