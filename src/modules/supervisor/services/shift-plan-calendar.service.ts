import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd, parseMonthParam } from "@/lib/month-working-calendar";
import { DUAL_OPS_REGIONS } from "@/lib/operations-dashboard";
import { listPerformanceStoresForFilter } from "@/modules/operations/services/operations-metrics.service";
import type {
  ShiftPlanCalendarDay,
  ShiftPlanMonthResponse,
} from "@/modules/supervisor/types/shift-plan-calendar";

function emptyCalendarDay(date: string, day: number, inMonth: boolean): ShiftPlanCalendarDay {
  return {
    date,
    day,
    inMonth,
    staffCount: 0,
    totalHours: 0,
    shifts: [],
  };
}

function buildCalendarGridDays(monthStartYmd: string, monthEndYmd: string): ShiftPlanCalendarDay[] {
  const start = parseDateOnlyUTC(monthStartYmd);
  const end = parseDateOnlyUTC(monthEndYmd);
  const padBefore = start.getUTCDay();

  const out: ShiftPlanCalendarDay[] = [];
  for (let i = padBefore; i > 0; i -= 1) {
    const d = new Date(start.getTime() - i * 86400000);
    out.push(emptyCalendarDay(formatDateOnly(d), d.getUTCDate(), false));
  }

  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    out.push(emptyCalendarDay(formatDateOnly(d), d.getUTCDate(), true));
  }

  const remainder = out.length % 7;
  const padAfter = remainder === 0 ? 0 : 7 - remainder;
  for (let i = 1; i <= padAfter; i += 1) {
    const d = new Date(end.getTime() + i * 86400000);
    out.push(emptyCalendarDay(formatDateOnly(d), d.getUTCDate(), false));
  }

  return out;
}

export async function buildShiftPlanMonth(input: {
  month: string;
  storeId?: string | null;
  region?: string | null;
}): Promise<ShiftPlanMonthResponse> {
  const parsed = parseMonthParam(input.month);
  if (!parsed) {
    throw new Error("month 格式必須為 YYYY-MM");
  }

  const { startYmd, endYmd } = monthStartEndYmd(parsed.year, parsed.month);
  const filterStores = await listPerformanceStoresForFilter();
  const opsRegions = DUAL_OPS_REGIONS as readonly string[];

  let scopedStores = filterStores.filter((s) => opsRegions.includes(s.region));
  if (input.region) {
    scopedStores = scopedStores.filter((s) => s.region === input.region);
  }
  if (input.storeId) {
    scopedStores = scopedStores.filter((s) => s.id === input.storeId);
  }

  const storeIds = scopedStores.map((s) => s.id);
  const storeNameById = new Map(scopedStores.map((s) => [s.id, s.storeName]));

  const calendarDays = buildCalendarGridDays(startYmd, endYmd);
  const shiftsByDate = new Map<string, ShiftPlanCalendarDay["shifts"]>();

  if (storeIds.length > 0) {
    const rows = await prisma.storeShiftPlan.findMany({
      where: {
        storeId: { in: storeIds },
        workDate: {
          gte: parseDateOnlyUTC(startYmd),
          lte: parseDateOnlyUTC(endYmd),
        },
      },
      select: {
        storeId: true,
        workDate: true,
        employeeCode: true,
        employeeName: true,
        scheduledHours: true,
        startTime: true,
        endTime: true,
        shiftKind: true,
      },
      orderBy: [{ workDate: "asc" }, { storeId: "asc" }, { employeeCode: "asc" }],
    });

    for (const row of rows) {
      const date = formatDateOnly(row.workDate);
      const hours = Math.round(Number(row.scheduledHours) * 100) / 100;
      if (!(hours > 0)) continue;

      const list = shiftsByDate.get(date) ?? [];
      list.push({
        storeId: row.storeId,
        storeName: storeNameById.get(row.storeId) ?? row.storeId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        scheduledHours: hours,
        startTime: row.startTime,
        endTime: row.endTime,
        shiftKind: row.shiftKind,
      });
      shiftsByDate.set(date, list);
    }
  }

  let totalShifts = 0;
  let totalHours = 0;
  let daysWithData = 0;

  for (const day of calendarDays) {
    if (!day.inMonth) continue;
    const shifts = shiftsByDate.get(day.date) ?? [];
    day.shifts = shifts;
    day.staffCount = shifts.length;
    day.totalHours = Math.round(shifts.reduce((a, s) => a + s.scheduledHours, 0) * 100) / 100;
    if (shifts.length > 0) {
      daysWithData += 1;
      totalShifts += shifts.length;
      totalHours += day.totalHours;
    }
  }

  return {
    month: input.month,
    startDate: startYmd,
    endDate: endYmd,
    region: input.region ?? null,
    storeId: input.storeId ?? null,
    summary: {
      totalShifts,
      totalHours: Math.round(totalHours * 100) / 100,
      daysWithData,
    },
    meta: {
      stores: scopedStores.map((s) => ({
        id: s.id,
        storeName: s.storeName,
        region: s.region,
      })),
    },
    calendarDays,
  };
}
