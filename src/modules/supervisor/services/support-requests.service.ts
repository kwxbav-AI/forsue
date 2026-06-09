import { prisma } from "@/lib/prisma";
import {
  addCalendarDaysUTC,
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
} from "@/lib/date";
import {
  countWorkingDaysInRangeUTC,
  monthStartEndYmd,
  parseMonthParam,
} from "@/lib/month-working-calendar";
import { DUAL_OPS_REGIONS, inferRetailRegion } from "@/lib/operations-dashboard";
import { storeMatchesSupervisorZone } from "@/lib/supervisor-zones";
import { computeDailyMetricsByStoreResilient } from "@/modules/performance/services/daily-store-metrics.service";
import { mapPerformanceToRetailStore } from "@/modules/operations/services/operations-dashboard-filter.service";
import type {
  SupportCalendarDay,
  SupportCalendarDayStatusCounts,
  SupportRequestsMonthResponse,
  SupportRequestStoreDay,
  SupportSeverity,
} from "@/modules/supervisor/types/support-requests";

function severityRank(s: SupportSeverity): number {
  return s === "none" ? 3 : s === "partial" ? 2 : s === "covered" ? 1 : 0;
}

function worstSeverity(list: SupportSeverity[]): SupportSeverity {
  let best: SupportSeverity = "empty";
  let rank = 0;
  for (const s of list) {
    const r = severityRank(s);
    if (r > rank) {
      rank = r;
      best = s;
    }
  }
  return best;
}

/**
 * 人力狀態（對應月曆標色）：
 * - covered（綠）完整人力：人力充足、無缺口，且非依支援補齊
 * - partial（黃）已補齊：原有缺口，經人力支援後補齊
 * - none（紅）仍缺人：人力不足，尚須申請支援
 */
function statusByGapAndSupport(
  targetHours: number | null,
  rosterHours: number,
  supportHours: number
): Exclude<SupportSeverity, "empty"> {
  if (targetHours == null) return "covered";
  const gapAfterRoster = targetHours - rosterHours;
  const gapAfterSupport = targetHours - rosterHours - supportHours;
  if (!Number.isFinite(gapAfterSupport)) return "covered";
  if (gapAfterSupport > 0) return "none";
  if (gapAfterRoster > 0 && supportHours > 0) return "partial";
  return "covered";
}

function computeGap(targetHours: number | null, effectiveHours: number): number | null {
  if (targetHours == null) return null;
  const gap = targetHours - effectiveHours;
  if (!Number.isFinite(gap)) return null;
  return gap > 0 ? Math.round(gap * 100) / 100 : 0;
}

function clampNonNegative(n: number): number {
  return n > 0 ? n : 0;
}

/** 依門市平日／週六編制或月目標均攤，取得單日目標工時 */
function resolveDailyLaborTargetHours(input: {
  isSunday: boolean;
  isHoliday: boolean;
  isSaturday: boolean;
  weekdayHours: number | null | undefined;
  saturdayHours: number | null | undefined;
  monthAverageDaily: number | null | undefined;
}): number | null {
  const { isSunday, isHoliday, isSaturday, weekdayHours, saturdayHours, monthAverageDaily } =
    input;
  if (isSunday || isHoliday) return 0;
  if (isSaturday && saturdayHours != null && saturdayHours > 0) return saturdayHours;
  if (!isSaturday && weekdayHours != null && weekdayHours > 0) return weekdayHours;
  if (monthAverageDaily != null && monthAverageDaily > 0) return monthAverageDaily;
  return null;
}

async function loadHolidayMap(startYmd: string, endYmd: string): Promise<Map<string, string>> {
  const holidays = await prisma.holiday.findMany({
    where: {
      isActive: true,
      date: { gte: parseDateOnlyUTC(startYmd), lte: parseDateOnlyUTC(endYmd) },
    },
    select: { date: true, name: true },
  });
  return new Map(holidays.map((h) => [formatDateOnly(h.date), h.name] as const));
}

async function loadHolidaySet(startYmd: string, endYmd: string): Promise<Set<string>> {
  const map = await loadHolidayMap(startYmd, endYmd);
  return new Set(map.keys());
}

function emptyStatusCounts(): SupportCalendarDayStatusCounts {
  return { covered: 0, none: 0, partial: 0 };
}

function countStoresByStatus(
  stores: SupportRequestStoreDay[],
  layer: "actual" | "planned"
): SupportCalendarDayStatusCounts {
  const out = emptyStatusCounts();
  for (const s of stores) {
    const st = layer === "actual" ? s.statusActual : s.statusPlanned;
    if (st === "covered") out.covered += 1;
    else if (st === "none") out.none += 1;
    else if (st === "partial") out.partial += 1;
  }
  return out;
}

function emptyCalendarDay(
  date: string,
  day: number,
  inMonth: boolean
): SupportCalendarDay {
  return {
    date,
    day,
    inMonth,
    storeCount: 0,
    severityActual: "empty",
    severityPlanned: "empty",
    countsActual: emptyStatusCounts(),
    countsPlanned: emptyStatusCounts(),
    holidayName: null,
  };
}

function buildCalendarGridDays(monthStartYmd: string, monthEndYmd: string): SupportCalendarDay[] {
  const start = parseDateOnlyUTC(monthStartYmd);
  const end = parseDateOnlyUTC(monthEndYmd);

  const startDow = start.getUTCDay(); // 0 Sun ... 6 Sat
  const padBefore = startDow; // Sunday-first grid

  const out: SupportCalendarDay[] = [];
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

export async function buildSupportRequestsMonth(input: {
  month: string; // YYYY-MM
  storeId?: string | null;
  region?: string | null;
  supervisorZone?: string | null;
}): Promise<SupportRequestsMonthResponse> {
  const parsed = parseMonthParam(input.month);
  if (!parsed) {
    throw new Error("month 格式必須為 YYYY-MM");
  }

  const { startYmd, endYmd } = monthStartEndYmd(parsed.year, parsed.month);
  const holidaySet = await loadHolidaySet(startYmd, endYmd);
  const workingDaysInMonth = countWorkingDaysInRangeUTC(startYmd, endYmd, holidaySet);

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      hideInReports: false,
      ...(input.storeId ? { id: input.storeId } : {}),
    },
    select: { id: true, name: true, department: true },
    orderBy: { name: "asc" },
  });

  const opsRegions = DUAL_OPS_REGIONS as readonly string[];
  const storesWithRegion = stores
    .map((s) => ({
      id: s.id,
      storeName: s.name,
      region: inferRetailRegion(s.name, s.department),
    }))
    .filter((s) => s.region != null && opsRegions.includes(s.region))
    .filter((s) => (input.region ? s.region === input.region : true))
    .filter((s) =>
      input.supervisorZone ?
        storeMatchesSupervisorZone(s.storeName, input.supervisorZone)
      : true
    );

  const storeIds = storesWithRegion.map((s) => s.id);
  const storeNameById = new Map(storesWithRegion.map((s) => [s.id, s.storeName] as const));
  const storeRegionById = new Map(storesWithRegion.map((s) => [s.id, s.region] as const));

  const perfToRetail = await mapPerformanceToRetailStore(storeIds);
  const retailIds = [...new Set([...perfToRetail.values()].map((v) => v.retailId))];

  const monthTargets =
    retailIds.length > 0
      ? await prisma.storeTarget.findMany({
          where: { storeId: { in: retailIds }, year: parsed.year, month: parsed.month },
          select: { storeId: true, laborHourTarget: true },
        })
      : [];
  const monthTargetByRetailId = new Map(monthTargets.map((t) => [t.storeId, Number(t.laborHourTarget)] as const));

  const dailyTargetByStoreId = new Map<string, number | null>();
  for (const storeId of storeIds) {
    const linked = perfToRetail.get(storeId) ?? null;
    const retailId = linked?.retailId ?? null;
    const monthTarget = retailId ? monthTargetByRetailId.get(retailId) ?? null : null;
    if (monthTarget != null && Number.isFinite(monthTarget) && monthTarget > 0 && workingDaysInMonth > 0) {
      dailyTargetByStoreId.set(storeId, Math.round((monthTarget / workingDaysInMonth) * 100) / 100);
      continue;
    }
    const fallback = linked?.settings.defaultLaborHoursPerDay ?? null;
    dailyTargetByStoreId.set(storeId, fallback != null && fallback > 0 ? fallback : null);
  }

  const dispatches = await prisma.dispatchRecord.findMany({
    where: {
      workDate: { gte: parseDateOnlyUTC(startYmd), lte: parseDateOnlyUTC(endYmd) },
      ...(storeIds.length > 0 ? { toStoreId: { in: storeIds } } : { toStoreId: { in: [] as string[] } }),
    },
    include: { employee: { select: { id: true, employeeCode: true, name: true } } },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  const creatorCodes = [
    ...new Set(dispatches.map((d) => d.createdBy?.trim()).filter(Boolean)),
  ] as string[];
  const creators =
    creatorCodes.length > 0
      ? await prisma.employee.findMany({
          where: { employeeCode: { in: creatorCodes } },
          select: { employeeCode: true, name: true },
        })
      : [];
  const creatorNameByCode = new Map(creators.map((e) => [e.employeeCode, e.name] as const));

  type DispatchAgg = {
    confirmedHours: number;
    plannedHours: number;
    confirmedRows: SupportRequestStoreDay["supportStaffConfirmed"];
    plannedRows: SupportRequestStoreDay["supportStaffPlanned"];
  };
  const dispatchByStoreDay = new Map<string, DispatchAgg>();

  let crossStoreConfirmed = 0;
  let crossStorePlanned = 0;

  for (const d of dispatches) {
    const date = formatDateOnly(d.workDate);
    const key = `${date}|${d.toStoreId}`;
    const planned = Number(d.dispatchHours);
    const actual = d.actualHours != null ? Number(d.actualHours) : null;
    const effective = actual ?? planned;
    const hours = Number.isFinite(effective) ? Math.round(effective * 100) / 100 : 0;
    if (!(hours > 0)) continue;

    const isConfirmed = (d.confirmStatus ?? "") === "已確認";

    if (d.fromStoreId && d.fromStoreId !== d.toStoreId) {
      if (isConfirmed) crossStoreConfirmed += hours;
      else crossStorePlanned += hours;
    }

    let agg = dispatchByStoreDay.get(key);
    if (!agg) {
      agg = { confirmedHours: 0, plannedHours: 0, confirmedRows: [], plannedRows: [] };
      dispatchByStoreDay.set(key, agg);
    }

    const createdByCode = d.createdBy?.trim() || null;
    const filledAt = d.createdAt.toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const row = {
      employeeId: d.employeeId,
      employeeCode: d.employee.employeeCode,
      employeeName: d.employee.name,
      fromStoreId: d.fromStoreId ?? null,
      fromStoreName: d.fromStoreId ? storeNameById.get(d.fromStoreId) ?? null : null,
      toStoreId: d.toStoreId,
      toStoreName: storeNameById.get(d.toStoreId) ?? null,
      hours,
      confirmStatus: isConfirmed ? ("已確認" as const) : ("待確認" as const),
      startTime: d.startTime ?? null,
      endTime: d.endTime ?? null,
      remark: d.remark ?? null,
      createdByCode,
      createdByName: createdByCode ? creatorNameByCode.get(createdByCode) ?? createdByCode : null,
      filledAt,
    };

    if (isConfirmed) {
      agg.confirmedHours += hours;
      agg.confirmedRows.push(row);
    } else {
      agg.plannedHours += hours;
      agg.plannedRows.push(row);
    }
  }

  const attendanceRows = await prisma.attendanceRecord.findMany({
    where: {
      workDate: { gte: parseDateOnlyUTC(startYmd), lte: parseDateOnlyUTC(endYmd) },
      ...(storeIds.length > 0 ? { originalStoreId: { in: storeIds } } : { originalStoreId: { in: [] as string[] } }),
    },
    select: {
      workDate: true,
      employeeId: true,
      workHours: true,
      startTime: true,
      endTime: true,
      shiftType: true,
      employee: { select: { employeeCode: true, name: true } },
      originalStoreId: true,
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "desc" }],
  });

  type AttAggRow = {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    workHours: number;
    startTime: string | null;
    endTime: string | null;
    shiftType: string | null;
  };
  const attendanceByStoreDay = new Map<string, Map<string, AttAggRow>>();
  for (const a of attendanceRows) {
    const storeId = a.originalStoreId;
    if (!storeId) continue;
    const date = formatDateOnly(a.workDate);
    const key = `${date}|${storeId}`;
    let byEmp = attendanceByStoreDay.get(key);
    if (!byEmp) {
      byEmp = new Map();
      attendanceByStoreDay.set(key, byEmp);
    }
    const prev = byEmp.get(a.employeeId);
    const nextHours = (prev?.workHours ?? 0) + Number(a.workHours);
    byEmp.set(a.employeeId, {
      employeeId: a.employeeId,
      employeeCode: a.employee.employeeCode,
      employeeName: a.employee.name,
      workHours: Math.round(nextHours * 100) / 100,
      startTime: prev?.startTime ?? a.startTime ?? null,
      endTime: prev?.endTime ?? a.endTime ?? null,
      shiftType: prev?.shiftType ?? a.shiftType ?? null,
    });
  }

  /** 含「今日」：當日亦以排班表顯示預測人力（與 UI「今日之後」文案一致） */
  const todayYmd = formatDateOnlyTaipei();

  const shiftPlanRows = await prisma.storeShiftPlan.findMany({
    where: {
      workDate: { gte: parseDateOnlyUTC(startYmd), lte: parseDateOnlyUTC(endYmd) },
      scheduledHours: { gt: 0 },
      ...(storeIds.length > 0 ? { storeId: { in: storeIds } } : { storeId: { in: [] as string[] } }),
    },
    select: {
      workDate: true,
      storeId: true,
      employeeId: true,
      employeeCode: true,
      employeeName: true,
      scheduledHours: true,
      startTime: true,
      endTime: true,
    },
    orderBy: [{ workDate: "asc" }, { employeeCode: "asc" }],
  });

  type ShiftAggRow = {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    workHours: number;
    startTime: string | null;
    endTime: string | null;
    shiftType: string | null;
  };
  const shiftByStoreDay = new Map<string, Map<string, ShiftAggRow>>();

  const sumShiftHours = (shiftMap: Map<string, ShiftAggRow> | undefined): number => {
    if (!shiftMap) return 0;
    return Math.round([...shiftMap.values()].reduce((sum, r) => sum + r.workHours, 0) * 100) / 100;
  };

  const listShiftStaff = (shiftMap: Map<string, ShiftAggRow> | undefined): ShiftAggRow[] =>
    [...(shiftMap?.values() ?? [])].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

  for (const sp of shiftPlanRows) {
    const date = formatDateOnlyTaipei(sp.workDate);
    const key = `${date}|${sp.storeId}`;
    let byEmp = shiftByStoreDay.get(key);
    if (!byEmp) {
      byEmp = new Map();
      shiftByStoreDay.set(key, byEmp);
    }
    const empKey = sp.employeeId ?? sp.employeeCode;
    const hours = Math.round(Number(sp.scheduledHours) * 100) / 100;
    const prev = byEmp.get(empKey);
    byEmp.set(empKey, {
      employeeId: sp.employeeId ?? sp.employeeCode,
      employeeCode: sp.employeeCode,
      employeeName: sp.employeeName ?? sp.employeeCode,
      workHours: Math.round(((prev?.workHours ?? 0) + hours) * 100) / 100,
      startTime: sp.startTime ?? prev?.startTime ?? null,
      endTime: sp.endTime ?? prev?.endTime ?? null,
      shiftType: prev?.shiftType ?? "排班",
    });
  }

  const storeDayRowsByDate = new Map<string, SupportRequestStoreDay[]>();

  for (let day = startYmd; day <= endYmd; day = addCalendarDaysUTC(day, 1)) {
    const d = parseDateOnlyUTC(day);
    const isFuture = day >= todayYmd;

    const dailyMetrics =
      isFuture ? null : await computeDailyMetricsByStoreResilient(d, { reportVisibleOnly: true });

    for (const storeId of storeIds) {
      const isSunday = d.getUTCDay() === 0;
      const isSaturday = d.getUTCDay() === 6;
      const isHoliday = holidaySet.has(day);
      const linked = perfToRetail.get(storeId) ?? null;
      const targetHours = resolveDailyLaborTargetHours({
        isSunday,
        isHoliday,
        isSaturday,
        weekdayHours: linked?.settings.weekdayBusinessHours,
        saturdayHours: linked?.settings.saturdayBusinessHours,
        monthAverageDaily: dailyTargetByStoreId.get(storeId) ?? null,
      });

      const disp = dispatchByStoreDay.get(`${day}|${storeId}`) ?? null;
      const supportInConfirmedHours = disp ? Math.round(disp.confirmedHours * 100) / 100 : 0;
      const supportInPlannedHours = disp ? Math.round(disp.plannedHours * 100) / 100 : 0;

      const shiftMap = shiftByStoreDay.get(`${day}|${storeId}`);
      const scheduledTotal = sumShiftHours(shiftMap);
      const shiftStaff = listShiftStaff(shiftMap);
      const hasShift = shiftStaff.length > 0;

      if (isFuture) {

        const gapConfirmed = computeGap(targetHours, scheduledTotal);
        const gapPlanned = computeGap(
          targetHours,
          scheduledTotal + supportInConfirmedHours + supportInPlannedHours
        );

        const statusActual = statusByGapAndSupport(
          targetHours,
          scheduledTotal,
          supportInConfirmedHours
        );
        const statusPlanned = statusByGapAndSupport(
          targetHours,
          scheduledTotal,
          supportInConfirmedHours + supportInPlannedHours
        );

        const include =
          (gapPlanned != null && gapPlanned > 0) ||
          (gapConfirmed != null && gapConfirmed > 0) ||
          supportInConfirmedHours > 0 ||
          supportInPlannedHours > 0 ||
          scheduledTotal > 0;
        if (!include) continue;

        const originalStaff = hasShift ? shiftStaff : [];

        const row: SupportRequestStoreDay = {
          date: day,
          storeId,
          storeName: storeNameById.get(storeId) ?? storeId,
          region: storeRegionById.get(storeId) ?? null,
          dataSource: "forecast",
          scheduledHours: scheduledTotal,
          targetHours,
          actualHoursConfirmed: scheduledTotal,
          supportInConfirmedHours,
          supportInPlannedHours,
          gapConfirmed,
          gapPlanned,
          statusActual,
          statusPlanned,
          originalStaff,
          supportStaffConfirmed: disp ? disp.confirmedRows : [],
          supportStaffPlanned: disp ? disp.plannedRows : [],
        };

        const list = storeDayRowsByDate.get(day) ?? [];
        list.push(row);
        storeDayRowsByDate.set(day, list);
        continue;
      }

      const m = dailyMetrics!.get(storeId) ?? { revenue: 0, laborHours: 0 };
      const actualHoursConfirmed = Math.round(clampNonNegative(m.laborHours) * 100) / 100;

      const gapConfirmed = computeGap(targetHours, actualHoursConfirmed);
      const gapPlanned = computeGap(
        targetHours,
        actualHoursConfirmed + supportInConfirmedHours + supportInPlannedHours
      );

      const statusActual = statusByGapAndSupport(
        targetHours,
        actualHoursConfirmed,
        supportInConfirmedHours
      );
      const statusPlanned = statusByGapAndSupport(
        targetHours,
        actualHoursConfirmed,
        supportInConfirmedHours + supportInPlannedHours
      );

      const include =
        (gapConfirmed != null && gapConfirmed > 0) ||
        supportInConfirmedHours > 0 ||
        supportInPlannedHours > 0 ||
        scheduledTotal > 0;
      if (!include) continue;

      const attendanceStaff = [
        ...(attendanceByStoreDay.get(`${day}|${storeId}`)?.values() ?? []),
      ];
      const originalStaff = hasShift
        ? shiftStaff
        : attendanceStaff;
      const useShiftDisplay = hasShift;

      const row: SupportRequestStoreDay = {
        date: day,
        storeId,
        storeName: storeNameById.get(storeId) ?? storeId,
        region: storeRegionById.get(storeId) ?? null,
        dataSource: useShiftDisplay ? "forecast" : "actual",
        scheduledHours: useShiftDisplay ? scheduledTotal : null,
        targetHours,
        actualHoursConfirmed,
        supportInConfirmedHours,
        supportInPlannedHours,
        gapConfirmed,
        gapPlanned,
        statusActual,
        statusPlanned,
        originalStaff,
        supportStaffConfirmed: disp ? disp.confirmedRows : [],
        supportStaffPlanned: disp ? disp.plannedRows : [],
      };

      const list = storeDayRowsByDate.get(day) ?? [];
      list.push(row);
      storeDayRowsByDate.set(day, list);
    }
  }

  const dates = [...storeDayRowsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stores]) => ({
      date,
      stores: stores.sort((a, b) => a.storeName.localeCompare(b.storeName)),
    }));

  const calendarDays = buildCalendarGridDays(startYmd, endYmd);
  const gridStartYmd = calendarDays[0]?.date ?? startYmd;
  const gridEndYmd = calendarDays[calendarDays.length - 1]?.date ?? endYmd;
  const holidayMap = await loadHolidayMap(gridStartYmd, gridEndYmd);

  const byDate = new Map(dates.map((d) => [d.date, d.stores] as const));
  for (const day of calendarDays) {
    day.holidayName = holidayMap.get(day.date) ?? null;
    if (!day.inMonth) continue;
    const list = byDate.get(day.date) ?? [];
    if (list.length === 0) continue;
    day.storeCount = list.length;
    day.countsActual = countStoresByStatus(list, "actual");
    day.countsPlanned = countStoresByStatus(list, "planned");
    day.severityActual = worstSeverity(list.map((s) => s.statusActual));
    day.severityPlanned = worstSeverity(list.map((s) => s.statusPlanned));
  }

  let requestCount = 0;
  let coveredCountActual = 0;
  let supplementedCountActual = 0;
  let shortageCountActual = 0;
  for (const d of dates) {
    for (const s of d.stores) {
      requestCount += 1;
      if (s.statusActual === "covered") coveredCountActual += 1;
      else if (s.statusActual === "partial") supplementedCountActual += 1;
      else if (s.statusActual === "none") shortageCountActual += 1;
    }
  }

  const staffedCountActual = coveredCountActual + supplementedCountActual;
  const coveredRateActual =
    requestCount > 0 ?
      Math.round((staffedCountActual / requestCount) * 1000) / 10
    : null;

  const storeFilterName = input.storeId ? storeNameById.get(input.storeId) ?? null : null;

  return {
    month: input.month,
    startDate: startYmd,
    endDate: endYmd,
    meta: {
      layerDefault: "planned",
      stores: storesWithRegion,
    },
    summary: {
      month: input.month,
      storeFilter: { storeId: input.storeId ?? null, storeName: storeFilterName },
      requestCount,
      coveredCountActual,
      supplementedCountActual,
      coveredRateActual,
      shortageCountActual,
      crossStoreSupportHoursConfirmed: Math.round(crossStoreConfirmed * 100) / 100,
      crossStoreSupportHoursPlanned: Math.round(crossStorePlanned * 100) / 100,
    },
    calendarDays,
    dates,
  };
}

