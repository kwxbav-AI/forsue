import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 調店津貼出勤率「不扣出勤天數」的假別
const EXEMPT_SHIFT_TYPES = ["排休", "事假", "公假", "公傷假", "颱風假"];

function isExemptLeave(shiftType: string | null): boolean {
  if (!shiftType) return false;
  return EXEMPT_SHIFT_TYPES.some((t) => shiftType.includes(t));
}

/** 計算某月的工作天數（週一到週五） */
function countWeekdays(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate(); // 該月幾天（month 是 1-based）
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** 計算某區間內的工作天數（週一到週五） */
function countWeekdaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
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
  const monthEnd = new Date(Date.UTC(year, month, 0)); // 末日

  // 查出該月有效的調任紀錄：
  //   transferDate <= 月末 AND (endDate IS NULL OR endDate >= 月首)
  const transfers = await prisma.storeTransferRecord.findMany({
    where: {
      transferDate: { lte: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
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

      // 本月總工作天數（分母基準）
      const totalWeekdays = countWeekdays(year, month);
      // 計算期間內工作天數（比例計算用）
      const periodWeekdays = isPartialMonth
        ? countWeekdaysInRange(periodStart, periodEnd)
        : totalWeekdays;

      // 查出該員工在該月的出勤紀錄
      const attendances = await prisma.attendanceRecord.findMany({
        where: {
          employeeId: t.employeeId,
          workDate: { gte: monthStart, lte: monthEnd },
        },
        select: { workDate: true, workHours: true, shiftType: true },
      });

      // 計算出勤天數（分子）
      // 算出勤 = workHours > 0 OR shiftType 為免扣假別
      const attendedDays = attendances.filter((a) => {
        const hrs = Number(a.workHours);
        return hrs > 0 || isExemptLeave(a.shiftType);
      }).length;

      // 出勤率（以分母 = 期間內工作天數）
      const attendanceRate =
        periodWeekdays > 0 ? attendedDays / periodWeekdays : 0;
      const isEligible = attendanceRate >= 0.9;

      // 計算津貼金額
      let amount = 0;
      if (isEligible) {
        if (t.allowanceType === "parttime") {
          // 兼職：2000 × 當月排班時數 / 176
          const scheduledHours = attendances.reduce((sum, a) => {
            // 只算有上班的（排班假別不計入時數）
            if (Number(a.workHours) > 0) return sum + Number(a.workHours);
            return sum;
          }, 0);
          const ratio = scheduledHours / 176;
          amount = Math.round(t.baseMonthlyAmount * ratio);
        } else {
          amount = t.baseMonthlyAmount;
        }
        // 部分月份按工作天數比例折算
        if (isPartialMonth && totalWeekdays > 0) {
          amount = Math.round((amount * periodWeekdays) / totalWeekdays);
        }
      }

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
        attendanceRate: Math.round(attendanceRate * 1000) / 10, // e.g. 95.2
        isEligible,
        amount,
        notes: t.notes,
      };
    })
  );

  return NextResponse.json(results.filter(Boolean));
}
