import { prisma } from "@/lib/prisma";
import { addCalendarDaysUTC, formatDateOnly, parseDateOnlyUTC, toStartOfDay } from "@/lib/date";

export type ReserveStaffSetting = {
  isReserveStaff: boolean;
  reserveWorkPercent: number | null;
};

export type ReserveStaffSettingByDate = Record<string, ReserveStaffSetting>;

function toSetting(row: { isReserveStaff: boolean; reserveWorkPercent: unknown }): ReserveStaffSetting {
  return {
    isReserveStaff: row.isReserveStaff,
    reserveWorkPercent: row.reserveWorkPercent == null ? null : Number(row.reserveWorkPercent),
  };
}

export async function getReserveStaffSettingsForDate(
  workDate: Date,
  employeeIds?: string[]
): Promise<Map<string, ReserveStaffSetting>> {
  const d = toStartOfDay(workDate);
  const periods = await prisma.employeeReserveStaffPeriod.findMany({
    where: {
      effectiveFrom: { lte: d },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: d } }],
      ...(employeeIds && employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : {}),
    },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }],
  });

  const settings = new Map<string, ReserveStaffSetting>();
  for (const period of periods) {
    if (settings.has(period.employeeId)) continue;
    settings.set(period.employeeId, toSetting(period));
  }
  return settings;
}

export async function getReserveStaffSettingsByEmployeeDate(
  startDate: Date,
  endDate: Date,
  employeeIds?: string[]
): Promise<Map<string, ReserveStaffSettingByDate>> {
  const start = toStartOfDay(startDate);
  const end = toStartOfDay(endDate);
  const periods = await prisma.employeeReserveStaffPeriod.findMany({
    where: {
      effectiveFrom: { lte: end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
      ...(employeeIds && employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : {}),
    },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "asc" }],
  });

  const settingsByEmployeeDate = new Map<string, ReserveStaffSettingByDate>();
  for (const period of periods) {
    const periodStartStr = formatDateOnly(period.effectiveFrom < start ? start : period.effectiveFrom);
    const periodEndStr = formatDateOnly(
      period.effectiveTo && period.effectiveTo < end ? period.effectiveTo : end
    );
    let dayStr = periodStartStr;
    while (dayStr <= periodEndStr) {
      const byDate = settingsByEmployeeDate.get(period.employeeId) ?? {};
      byDate[dayStr] = toSetting(period);
      settingsByEmployeeDate.set(period.employeeId, byDate);
      dayStr = addCalendarDaysUTC(dayStr, 1);
    }
  }
  return settingsByEmployeeDate;
}

export function getReserveStaffSettingForEmployeeDate(
  settingsByEmployeeDate: Map<string, ReserveStaffSettingByDate>,
  employeeId: string,
  dateStr: string,
  fallback?: ReserveStaffSetting
): ReserveStaffSetting {
  return (
    settingsByEmployeeDate.get(employeeId)?.[dateStr] ??
    fallback ?? {
      isReserveStaff: false,
      reserveWorkPercent: null,
    }
  );
}

export function parseEffectiveFrom(value: unknown): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("請提供生效日期");
  }
  return parseDateOnlyUTC(value);
}
