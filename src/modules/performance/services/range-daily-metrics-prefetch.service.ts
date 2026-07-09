import { prisma } from "@/lib/prisma";
import {
  businessDayWorkDateFromDate,
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  toDateRangeTaipei,
  toStartOfDay,
} from "@/lib/date";
import {
  getAttendanceDataStartDate,
  getNewHireOffsetOverridesByEmployeeCode,
  isEligibleForNewHireWorkPercent,
} from "@/lib/attendance-data";
import {
  getReserveStaffSettingsByEmployeeDate,
  type ReserveStaffSettingByDate,
} from "@/lib/reserve-staff-periods";
import type { AllocationPrefetchContext } from "./attendance-allocation.service";
import {
  computeDailyRevenueOnlyByStore,
  type DailyStoreMetrics,
} from "./daily-store-metrics.service";
import { computeTotalWorkHoursByStore } from "./attendance-allocation.service";

type ComputeOptions = {
  reportVisibleOnly?: boolean;
};

export type RangeDailyMetricsPrefetch = {
  allocation: AllocationPrefetchContext;
  stores: { id: string; name: string }[];
  nameToStore: Map<string, string>;
  revenueByYmdStore: Map<string, Map<string, number>>;
  contentDeductionByYmdStore: Map<string, Record<string, number>>;
  storeDeductionByYmdStore: Map<string, Record<string, number>>;
};

function indexByExactWorkDate<T extends { workDate: Date }>(
  rows: T[],
  keyFn: (row: T) => Date = (r) => businessDayWorkDateFromDate(r.workDate)
): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const t = keyFn(row).getTime();
    const list = map.get(t) ?? [];
    list.push(row);
    map.set(t, list);
  }
  return map;
}

/** 區間一次載入出勤／調度／營收等，供逐日重複使用既有公式 */
export async function buildRangeDailyMetricsPrefetch(
  startYmd: string,
  endYmd: string,
  options: ComputeOptions = {}
): Promise<RangeDailyMetricsPrefetch> {
  const { reportVisibleOnly = true } = options;
  const rangeStart = parseDateOnlyUTC(startYmd);
  const rangeEnd = parseDateOnlyUTC(endYmd);
  const { start: revenueStart, end: revenueEnd } = toDateRangeTaipei(startYmd, endYmd);

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...(reportVisibleOnly ? { hideInReports: false } : {}),
    },
    select: { id: true, name: true },
  });

  const nameToStore = new Map<string, string>();
  for (const s of stores) {
    const key = s.name.trim();
    nameToStore.set(key, s.id);
    if (!key.endsWith("店")) nameToStore.set(`${key}店`, s.id);
  }

  const [
    activeEmployees,
    attendanceDataStartDate,
    newHireOffsetOverridesByEmployeeCode,
    allAttendances,
    allDispatches,
    allAdjustments,
    revenueRows,
    contentEntries,
    storeDeductions,
  ] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      select: {
        id: true,
        defaultStoreId: true,
        isReserveStaff: true,
        reserveWorkPercent: true,
        hireDate: true,
        employeeCode: true,
        name: true,
      },
    }),
    getAttendanceDataStartDate(),
    getNewHireOffsetOverridesByEmployeeCode(),
    prisma.attendanceRecord.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
      include: { employee: true },
    }),
    prisma.dispatchRecord.findMany({
      where: {
        workDate: { gte: rangeStart, lte: rangeEnd },
        confirmStatus: "已確認",
      },
    }),
    prisma.workhourAdjustment.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
    }),
    prisma.revenueRecord.findMany({
      where: { revenueDate: { gte: revenueStart, lte: revenueEnd } },
      select: { storeId: true, revenueDate: true, revenueAmount: true },
    }),
    prisma.contentEntry.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
      select: { branch: true, deductedMinutes: true, workDate: true },
    }),
    prisma.storeHourDeduction.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
      select: { storeId: true, hours: true, workDate: true },
    }),
  ]);

  const employeeIdsInRange = [...new Set(allAttendances.map((a) => a.employeeId))];
  const reserveSettingsByEmployeeDate = await getReserveStaffSettingsByEmployeeDate(
    rangeStart,
    rangeEnd,
    employeeIdsInRange
  );

  const noDefaultIds = activeEmployees.filter((e) => !e.defaultStoreId).map((e) => e.id);
  const fallbackHomeStoreByEmployee = new Map<string, string>();
  if (noDefaultIds.length > 0) {
    const attRecords = await prisma.attendanceRecord.findMany({
      where: { employeeId: { in: noDefaultIds }, originalStoreId: { not: null } },
      select: { employeeId: true, originalStoreId: true },
      orderBy: { workDate: "desc" },
    });
    for (const a of attRecords) {
      if (!a.originalStoreId) continue;
      if (fallbackHomeStoreByEmployee.has(a.employeeId)) continue;
      fallbackHomeStoreByEmployee.set(a.employeeId, a.originalStoreId);
    }
  }

  const newHireCandidateIds = new Set<string>();
  let earliestHireDate: Date | null = null;
  for (const a of allAttendances) {
    const codePrefix = (a.employee.employeeCode || "").trim().toLowerCase();
    if (codePrefix.startsWith("a") || codePrefix.startsWith("b")) continue;
    if (!a.employee.hireDate) continue;
    if (!(Number(a.workHours) > 0)) continue;
    if (!isEligibleForNewHireWorkPercent(a.employee.hireDate)) continue;
    newHireCandidateIds.add(a.employeeId);
    const t = toStartOfDay(a.employee.hireDate);
    if (!earliestHireDate || t.getTime() < earliestHireDate.getTime()) {
      earliestHireDate = t;
    }
  }

  const workedAttendanceRowsForNewHire =
    newHireCandidateIds.size > 0 && earliestHireDate
      ? await prisma.attendanceRecord.findMany({
          where: {
            employeeId: { in: [...newHireCandidateIds] },
            workDate: { gte: earliestHireDate, lte: rangeEnd },
            workHours: { gt: 0 },
          },
          select: { employeeId: true, workDate: true },
          orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
        })
      : [];

  const employeeNameById = new Map<string, string>();
  const employeeCodeById = new Map<string, string>();
  for (const a of allAttendances) {
    if (a.employeeId && a.employee?.name) employeeNameById.set(a.employeeId, a.employee.name);
    if (a.employeeId && a.employee?.employeeCode) {
      employeeCodeById.set(a.employeeId, a.employee.employeeCode);
    }
  }
  const missingNameIds = [
    ...new Set(
      [...allDispatches.map((x) => x.employeeId), ...allAdjustments.map((x) => x.employeeId)].filter(
        (id): id is string => Boolean(id) && !employeeNameById.has(id)
      )
    ),
  ];
  if (missingNameIds.length > 0) {
    const emps = await prisma.employee.findMany({
      where: { id: { in: missingNameIds } },
      select: { id: true, name: true, employeeCode: true },
    });
    for (const e of emps) {
      if (e.name) employeeNameById.set(e.id, e.name);
      if (e.employeeCode) employeeCodeById.set(e.id, e.employeeCode);
    }
  }

  const allocation: AllocationPrefetchContext = {
    activeEmployees,
    fallbackHomeStoreByEmployee,
    reserveSettingsByEmployeeDate,
    attendanceDataStartDate,
    newHireOffsetOverridesByEmployeeCode,
    workedAttendanceRowsForNewHire,
    attendancesByExactWorkDate: indexByExactWorkDate(allAttendances),
    dispatchesByExactWorkDate: indexByExactWorkDate(allDispatches),
    adjustmentsByExactWorkDate: indexByExactWorkDate(allAdjustments),
    employeeNameById,
    employeeCodeById,
  };

  const revenueByYmdStore = new Map<string, Map<string, number>>();
  for (const r of revenueRows) {
    const ymd = formatDateOnlyTaipei(r.revenueDate);
    const rev = Number(r.revenueAmount ?? 0);
    if (rev <= 0) continue;
    let byStore = revenueByYmdStore.get(ymd);
    if (!byStore) {
      byStore = new Map();
      revenueByYmdStore.set(ymd, byStore);
    }
    byStore.set(r.storeId, (byStore.get(r.storeId) ?? 0) + rev);
  }

  const contentDeductionByYmdStore = new Map<string, Record<string, number>>();
  for (const entry of contentEntries) {
    const ymd = formatDateOnly(entry.workDate);
    const key = entry.branch.trim();
    if (!key || entry.deductedMinutes == null) continue;
    const storeId = nameToStore.get(key) ?? nameToStore.get(key.replace(/店$/, ""));
    if (!storeId) continue;
    const bucket = contentDeductionByYmdStore.get(ymd) ?? {};
    bucket[storeId] = (bucket[storeId] ?? 0) + entry.deductedMinutes / 60;
    contentDeductionByYmdStore.set(ymd, bucket);
  }

  const storeDeductionByYmdStore = new Map<string, Record<string, number>>();
  for (const row of storeDeductions) {
    const ymd = formatDateOnly(row.workDate);
    const h = Number(row.hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    const bucket = storeDeductionByYmdStore.get(ymd) ?? {};
    bucket[row.storeId] = (bucket[row.storeId] ?? 0) + h;
    storeDeductionByYmdStore.set(ymd, bucket);
  }

  return {
    allocation,
    stores,
    nameToStore,
    revenueByYmdStore,
    contentDeductionByYmdStore,
    storeDeductionByYmdStore,
  };
}

/** 使用預載資料計算單日各門市營收與工時（公式與 computeDailyMetricsByStore 相同） */
export async function computeDailyMetricsByStoreWithPrefetch(
  workDate: Date,
  prefetch: RangeDailyMetricsPrefetch,
  options: ComputeOptions = {}
): Promise<Map<string, DailyStoreMetrics>> {
  const { reportVisibleOnly = true } = options;
  const businessYmd = formatDateOnly(toStartOfDay(workDate));
  const storeHours = await computeTotalWorkHoursByStore(workDate, {
    prefetch: prefetch.allocation,
  });

  const revenueSumByStoreId = prefetch.revenueByYmdStore.get(businessYmd) ?? new Map();
  const contentDeductionHoursByStore =
    prefetch.contentDeductionByYmdStore.get(businessYmd) ?? {};
  const storeDeductionHoursByStore =
    prefetch.storeDeductionByYmdStore.get(businessYmd) ?? {};

  const result = new Map<string, DailyStoreMetrics>();
  for (const store of prefetch.stores) {
    const rawHours = storeHours[store.id] ?? 0;
    const contentDeduction = contentDeductionHoursByStore[store.id] ?? 0;
    const storeDeduction = storeDeductionHoursByStore[store.id] ?? 0;
    const laborHours = Math.max(0, rawHours - contentDeduction - storeDeduction);
    const revenue = revenueSumByStoreId.get(store.id) ?? 0;
    result.set(store.id, { revenue, laborHours, rawHours });
  }

  return result;
}

export async function computeDailyMetricsByStoreResilientWithPrefetch(
  workDate: Date,
  prefetch: RangeDailyMetricsPrefetch,
  options: ComputeOptions = {}
): Promise<Map<string, DailyStoreMetrics>> {
  try {
    return await computeDailyMetricsByStoreWithPrefetch(workDate, prefetch, options);
  } catch (err) {
    console.error(
      `computeDailyMetricsByStoreWithPrefetch failed for ${formatDateOnly(workDate)}`,
      err
    );
    return computeDailyRevenueOnlyByStore(workDate, options);
  }
}
