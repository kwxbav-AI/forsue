import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, formatDateOnly, formatDateOnlyTaipei, parseDateOnlyUTC } from "@/lib/date";
import {
  buildWeeksForMonth,
  countWorkingDaysInRangeUTC,
  monthStartEndYmd,
  parseMonthParam,
} from "@/lib/month-working-calendar";

export const dynamic = "force-dynamic";

/** 歷史欄位數（含 2025-01～2026-04 等長區間；選月較晚時仍可追溯） */
const HISTORY_MONTH_COUNT = 36;

function num(x: unknown): number {
  return x == null ? 0 : Number(x);
}

function addCalendarMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { year: y, month: m };
}

function clampYmd(ymd: string, minYmd: string, maxYmd: string): string {
  if (ymd < minYmd) return minYmd;
  if (ymd > maxYmd) return maxYmd;
  return ymd;
}

function minYmd(a: string, b: string): string {
  return a <= b ? a : b;
}

function historyMonthLabel(y: number, m: number): string {
  return `${y}年${m}月`;
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

  const { year: reportYear, month: reportMonth } = parsed;
  const { startYmd: monthStartYmd, endYmd: monthEndYmd } = monthStartEndYmd(reportYear, reportMonth);

  const asOfParam = searchParams.get("asOfDate")?.trim();
  const todayTaipei = formatDateOnlyTaipei(new Date());
  const yesterdayTaipei = addCalendarDaysUTC(todayTaipei, -1);

  let requestedAsOfYmd: string;
  if (asOfParam) {
    try {
      parseDateOnlyUTC(asOfParam);
      requestedAsOfYmd = asOfParam;
    } catch {
      return NextResponse.json({ error: "asOfDate 格式錯誤，請使用 YYYY-MM-DD" }, { status: 400 });
    }
  } else {
    requestedAsOfYmd = todayTaipei;
  }
  requestedAsOfYmd = clampYmd(requestedAsOfYmd, monthStartYmd, monthEndYmd);

  /** 營收加總不含「今天」（台北日曆）；且不得晚於使用者選的截止日 */
  let revenueCutoffYmd = minYmd(requestedAsOfYmd, yesterdayTaipei);
  revenueCutoffYmd = clampYmd(revenueCutoffYmd, monthStartYmd, monthEndYmd);

  const oldestHist = addCalendarMonths(reportYear, reportMonth, -HISTORY_MONTH_COUNT);
  const oldestStartYmd = monthStartEndYmd(oldestHist.year, oldestHist.month).startYmd;

  const [stores, holidays] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true, hideInReports: false as any },
      select: { id: true, name: true, code: true, department: true },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    }),
    prisma.holiday.findMany({
      where: {
        isActive: true,
        date: {
          gte: parseDateOnlyUTC(oldestStartYmd),
          lte: parseDateOnlyUTC(monthEndYmd),
        },
      },
      select: { date: true },
    }),
  ]);

  const holidaySet = new Set(holidays.map((h) => formatDateOnly(h.date)));

  const { weeks: weekSegments } = buildWeeksForMonth(monthStartYmd, monthEndYmd);
  const weeksWithWorking = weekSegments.map((w) => ({
    index: w.index,
    startYmd: w.startYmd,
    endYmd: w.endYmd,
    workingDays: countWorkingDaysInRangeUTC(w.startYmd, w.endYmd, holidaySet),
  }));
  const totalMonthWorkingDays = weeksWithWorking.reduce((s, w) => s + w.workingDays, 0);

  const historyMonths: { key: string; label: string; startYmd: string; endYmd: string }[] = [];
  for (let i = 1; i <= HISTORY_MONTH_COUNT; i++) {
    const { year: hy, month: hm } = addCalendarMonths(reportYear, reportMonth, -i);
    const { startYmd: hStart, endYmd: hEnd } = monthStartEndYmd(hy, hm);
    const mm = String(hm).padStart(2, "0");
    historyMonths.push({
      key: `${hy}-${mm}`,
      label: historyMonthLabel(hy, hm),
      startYmd: hStart,
      endYmd: hEnd,
    });
  }

  const performanceRows = await prisma.performanceDaily.findMany({
    where: {
      workDate: {
        gte: parseDateOnlyUTC(oldestStartYmd),
        lte: parseDateOnlyUTC(revenueCutoffYmd),
      },
      versionNo: 1,
      store: { isActive: true, hideInReports: false as any },
    },
    select: {
      storeId: true,
      workDate: true,
      revenueAmount: true,
    },
  });

  const mtdByStore = new Map<string, number>();
  const historyByStoreByIndex = new Map<string, number[]>();
  const dailyTotalByYmd = new Map<string, number>();

  for (const s of stores) {
    mtdByStore.set(s.id, 0);
    historyByStoreByIndex.set(s.id, Array.from({ length: HISTORY_MONTH_COUNT }, () => 0));
  }

  /** 帳上有資料的日曆日（全門市聯集）：統一上傳時任一家有 PerformanceDaily 即視為該日已上傳 */
  const dataDayYmdSet = new Set<string>();

  for (const p of performanceRows) {
    const ymd = formatDateOnly(p.workDate);
    const rev = num(p.revenueAmount);

    if (ymd >= monthStartYmd && ymd <= revenueCutoffYmd) {
      mtdByStore.set(p.storeId, (mtdByStore.get(p.storeId) ?? 0) + rev);
      dailyTotalByYmd.set(ymd, (dailyTotalByYmd.get(ymd) ?? 0) + rev);
      dataDayYmdSet.add(ymd);
    }

    for (let hi = 0; hi < historyMonths.length; hi++) {
      const { startYmd: h0, endYmd: h1 } = historyMonths[hi];
      if (ymd >= h0 && ymd <= h1) {
        const arr = historyByStoreByIndex.get(p.storeId);
        if (arr) arr[hi] += rev;
        break;
      }
    }
  }

  const uploadedDataDays = dataDayYmdSet.size;
  let weekdayUploadedDataDays = 0;
  let saturdayUploadedDataDays = 0;
  for (const ymd of dataDayYmdSet) {
    const d = parseDateOnlyUTC(ymd);
    const dow = d.getUTCDay();
    if (dow === 0) continue;
    if (dow === 6) saturdayUploadedDataDays += 1;
    else weekdayUploadedDataDays += 1;
  }

  let weekdayRevSum = 0;
  let weekdayRevCount = 0;
  let saturdayRevSum = 0;
  let saturdayRevCount = 0;

  for (let t = parseDateOnlyUTC(monthStartYmd).getTime(); t <= parseDateOnlyUTC(revenueCutoffYmd).getTime(); t += 86400000) {
    const d = new Date(t);
    const ymd = formatDateOnly(d);
    if (d.getUTCDay() === 0) continue;
    if (holidaySet.has(ymd)) continue;
    const dayTotal = dailyTotalByYmd.get(ymd) ?? 0;
    if (d.getUTCDay() === 6) {
      saturdayRevSum += dayTotal;
      saturdayRevCount += 1;
    } else {
      weekdayRevSum += dayTotal;
      weekdayRevCount += 1;
    }
  }

  const weekdayAvgRevenue = weekdayRevCount > 0 ? weekdayRevSum / weekdayRevCount : 0;
  const saturdayAvgRevenue = saturdayRevCount > 0 ? saturdayRevSum / saturdayRevCount : 0;

  const prevMonthIdx0 = 0;
  const storeRows = stores.map((s) => {
    const actualMtd = mtdByStore.get(s.id) ?? 0;
    const historyByMonth = (historyByStoreByIndex.get(s.id) ?? []).map((v) => v);
    const prevActual = historyByMonth[prevMonthIdx0] ?? 0;
    const forecast =
      uploadedDataDays > 0 ? (actualMtd / uploadedDataDays) * totalMonthWorkingDays : null;
    const forecastPct =
      forecast != null && prevActual > 0 ? ((forecast - prevActual) / prevActual) * 100 : null;

    return {
      storeId: s.id,
      storeName: s.name,
      storeCode: s.code ?? null,
      region: s.department?.trim() || null,
      actualMtd,
      forecast,
      forecastPct,
      historyByMonth,
    };
  });

  const actualMtdTotal = storeRows.reduce((s, r) => s + r.actualMtd, 0);
  const forecastTotal =
    uploadedDataDays > 0 ? (actualMtdTotal / uploadedDataDays) * totalMonthWorkingDays : null;
  const prevMonthTotalAll = storeRows.reduce((s, r) => s + (r.historyByMonth[prevMonthIdx0] ?? 0), 0);
  const forecastPctTotal =
    forecastTotal != null && prevMonthTotalAll > 0
      ? ((forecastTotal - prevMonthTotalAll) / prevMonthTotalAll) * 100
      : null;

  const historyTotals = historyMonths.map((_, hi) => storeRows.reduce((s, r) => s + (r.historyByMonth[hi] ?? 0), 0));

  return NextResponse.json({
    month,
    monthStart: monthStartYmd,
    monthEnd: monthEndYmd,
    /** 實際用於營收加總、預估分母、區間顯示之截止（不含今日；≤ 所選 asOf） */
    asOfDate: revenueCutoffYmd,
    asOfDateRequested: requestedAsOfYmd,
    historyMonths: historyMonths.map((h) => ({ key: h.key, label: h.label })),
    meta: {
      /** 與 uploadedDataDays 相同，供舊版前端相容 */
      uploadedWorkingDays: uploadedDataDays,
      uploadedDataDays,
      totalMonthWorkingDays,
      weekdayUploadedDataDays,
      saturdayUploadedDataDays,
      revenueDenominator: "distinctGlobalPerformanceDays" as const,
      revenueExcludesTodayTaipei: true,
      weeks: weeksWithWorking,
    },
    stores: storeRows,
    totals: {
      actualMtd: actualMtdTotal,
      forecast: forecastTotal,
      forecastPct: forecastPctTotal,
      historyByMonth: historyTotals,
      weekdayAvgRevenue,
      saturdayAvgRevenue,
    },
  });
}
