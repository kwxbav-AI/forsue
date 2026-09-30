import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 調店津貼出勤率「不扣出勤天數」的假別
const EXEMPT_SHIFT_TYPES = ["排休", "事假", "公假", "公傷假", "颱風假"];

function isExemptLeave(shiftType: string | null): boolean {
  if (!shiftType) return false;
  return EXEMPT_SHIFT_TYPES.some((t) => shiftType.includes(t));
}

/** 計算某月的工作天數（週一到週五，扣除假日） */
function countWeekdays(year: number, month: number, holidaySet: Set<string>): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = dt.toISOString().slice(0, 10);
      if (!holidaySet.has(ymd)) count++;
    }
  }
  return count;
}

/** 計算某區間內的工作天數（週一到週五，扣除假日） */
function countWeekdaysInRange(start: Date, end: Date, holidaySet: Set<string>): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const ymd = cur.toISOString().slice(0, 10);
      if (!holidaySet.has(ymd)) count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/**
 * GET /api/store-transfer/allowance?month=YYYY-MM
 * 回傳該月所有有效調店紀錄的津貼計算結果
 */
export async function GET(request: NextRequest) {
  const monthStr = request.nextUrl.searchParams.get("month");
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    return NextResponse.json({ error: "month 參數格式應為 YYYY-MM" }, { status: 400 });
  }

  const [year, month] = monthStr.split("-").map(Number);
  // 該月首日與末日（UTC Date）
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const fullMonthEnd = new Date(Date.UTC(year, month, 0)); // 月底最後一天
  // 若查詢當月，以今天（台北 UTC+8 的今日 UTC 日曆日）為上界，避免分母算到未來
  const todayUtc = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  ));
  const monthEnd = todayUtc < fullMonthEnd ? todayUtc : fullMonthEnd;

  // 查出該月的國定假日（isActive = true）
  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: { gte: monthStart, lte: monthEnd },
    },
    select: { date: true },
  });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  // 查出該月有效的調任紀錄：
  //   transferDate <= 月末 AND (endDate IS NULL OR endDate >= 月首)
  const transfers = await prisma.storeTransferRecord.findMany({
    where: {
      transferDate: { lte: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true, position: true } },
      fromStore: { select: { id: true, name: true } },
      toStore: { select: { id: true, name: true } },
    },
    orderBy: [{ transferDate: "asc" }],
  });

  const results = await Promise.all(
    transfers.map(async (t) => {
      // 計算這是調任後的第幾個月（1-based）
      const transferMonth = new Date(Date.UTC(
        t.transferDate.getUTCFullYear(),
        t.transferDate.getUTCMonth(),
        1
      ));
      // monthsSince = 月份差
      const monthsSince =
        (year - transferMonth.getUTCFullYear()) * 12 +
        (month - 1 - transferMonth.getUTCMonth());
      const nthMonth = monthsSince + 1; // 1~6

      // 超過 6 個月不發
      if (nthMonth > 6 || nthMonth < 1) {
        return null;
      }

      // 本月實際計算區間（可能是第一個月或最後一個月的片段）
      const periodStart =
        t.transferDate > monthStart ? new Date(t.transferDate) : new Date(monthStart);
      const periodEnd =
        t.endDate && t.endDate < monthEnd ? new Date(t.endDate) : new Date(monthEnd);

      // 是否為部分月份
      const isPartialMonth =
        periodStart.getTime() !== monthStart.getTime() ||
        periodEnd.getTime() !== monthEnd.getTime();

      // 本月總工作天數（部分月份比例用，扣除國定假日）
      const totalWeekdays = countWeekdays(year, month, holidaySet);

      // 查出該員工在計算期間的出勤紀錄
      const attendances = await prisma.attendanceRecord.findMany({
        where: {
          employeeId: t.employeeId,
          workDate: { gte: periodStart, lte: periodEnd },
        },
        select: { workDate: true, workHours: true, shiftType: true },
      });

      // 出勤率分母 = 有出勤紀錄且落在週一到週五的天數（自動排除空班日）
      const periodWeekdays = attendances.filter((a) => {
        const dow = a.workDate.getUTCDay();
        return dow !== 0 && dow !== 6;
      }).length;

      // 計算出勤天數（分子）：workHours > 0 OR 免扣假別
      const attendedDays = attendances.filter((a) => {
        const hrs = Number(a.workHours);
        return hrs > 0 || isExemptLeave(a.shiftType);
      }).length;

      // 出勤率（以分母 = 有紀錄的工作天數）
      const attendanceRate =
        periodWeekdays > 0 ? attendedDays / periodWeekdays : 0;
      const isEligible = attendanceRate >= 0.9;

      // 計算津貼金額
      let amount = 0;
      if (isEligible) {
        if (t.allowanceType === "parttime") {
          // 兼職：2000 × 當月排班時數 / (8H × 期間工作天)
          const scheduledHours = attendances.reduce((sum, a) => {
            if (Number(a.workHours) > 0) return sum + Number(a.workHours);
            return sum;
          }, 0);
          const denominator = 8 * periodWeekdays;
          const ratio = denominator > 0 ? scheduledHours / denominator : 0;
          amount = Math.round(t.baseMonthlyAmount * ratio);
        } else {
          amount = t.baseMonthlyAmount;
        }
        // 部分月份按工作天數比例折算
        if (isPartialMonth && totalWeekdays > 0) {
          amount = Math.round((amount * periodWeekdays) / totalWeekdays);
        }
      }

      // 兼職：計算排班時數供前端顯示明細
      const scheduledHours =
        t.allowanceType === "parttime"
          ? Math.round(
              attendances.reduce((sum, a) => {
                if (Number(a.workHours) > 0) return sum + Number(a.workHours);
                return sum;
              }, 0) * 100
            ) / 100
          : null;

      return {
        id: t.id,
        employee: t.employee,
        fromStore: t.fromStore,
        toStore: t.toStore,
        transferDate: toDateStr(t.transferDate),
        endDate: t.endDate ? toDateStr(t.endDate) : null,
        allowanceType: t.allowanceType,
        baseMonthlyAmount: t.baseMonthlyAmount,
        nthMonth,
        periodStart: toDateStr(periodStart),
        periodEnd: toDateStr(periodEnd),
        isPartialMonth,
        totalWeekdays,
        periodWeekdays,
        attendedDays,
        attendanceRate: Math.round(attendanceRate * 1000) / 10,
        isEligible,
        amount,
        scheduledHours,
        notes: t.notes,
      };
    })
  );

  return NextResponse.json(results.filter(Boolean));
}
