import { prisma } from "@/lib/prisma";
import { resolveScheduledHours } from "@/lib/scheduled-hours";
import Decimal from "decimal.js";
import {
  businessDayWorkDateFromDate,
  formatDateOnly,
  toStartOfDay,
} from "@/lib/date";
import {
  buildNewHireWorkedDayNoIndex,
  getAttendanceDataStartDate,
  getNewHireOffsetOverridesByEmployeeCode,
  isEligibleForNewHireWorkPercent,
  newHirePercentByWorkedDays,
} from "@/lib/attendance-data";
import {
  getReserveStaffSettingForEmployeeDate,
  getReserveStaffSettingsForDate,
  type ReserveStaffSettingByDate,
} from "@/lib/reserve-staff-periods";

/** 單一員工單日、依門市拆分後的工時 { storeId: hours } */
export type StoreHoursMap = Record<string, number>;

type AttendanceWithEmployee = {
  employeeId: string;
  originalStoreId: string | null;
  workHours: unknown;
  shiftType: string | null;
  scheduledWorkHours?: unknown;
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    defaultStoreId: string | null;
    isReserveStaff: boolean;
    reserveWorkPercent: unknown;
    hireDate: Date | null;
  };
};

export type AllocationPrefetchContext = {
  activeEmployees: Array<{
    id: string;
    defaultStoreId: string | null;
    isReserveStaff: boolean;
    reserveWorkPercent: unknown;
    hireDate: Date | null;
    employeeCode: string;
    name: string;
  }>;
  fallbackHomeStoreByEmployee: Map<string, string>;
  reserveSettingsByEmployeeDate: Map<string, ReserveStaffSettingByDate>;
  attendanceDataStartDate: Date;
  newHireOffsetOverridesByEmployeeCode: Awaited<
    ReturnType<typeof getNewHireOffsetOverridesByEmployeeCode>
  >;
  workedAttendanceRowsForNewHire: Array<{ employeeId: string; workDate: Date }>;
  attendancesByExactWorkDate: Map<number, AttendanceWithEmployee[]>;
  dispatchesByExactWorkDate: Map<number, Awaited<
    ReturnType<typeof prisma.dispatchRecord.findMany>
  >>;
  adjustmentsByExactWorkDate: Map<number, Awaited<
    ReturnType<typeof prisma.workhourAdjustment.findMany>
  >>;
  employeeNameById: Map<string, string>;
  employeeCodeById: Map<string, string>;
};

export type StoreHoursComputeOptions = {
  prefetch?: AllocationPrefetchContext;
};

function isTrialEmployeeCode(employeeCode: string): boolean {
  const prefix = (employeeCode || "").trim().toLowerCase();
  return prefix.startsWith("a") || prefix.startsWith("b");
}

/**
 * Step A: 出勤工時（原店，試作前保留實際時數）
 * Step B: 調度拆分（原店減、支援店加）
 * Step C: 試作規則（有計入工時的門市改為 -3）
 * Step D: 人工調整
 * 回傳：每位員工在各門市的最終工時
 */
export async function computeStoreHoursByEmployee(
  workDate: Date,
  options?: StoreHoursComputeOptions
): Promise<Map<string, StoreHoursMap>> {
  const prefetch = options?.prefetch;
  const d = toStartOfDay(workDate);
  const exactWorkDate = businessDayWorkDateFromDate(d);
  const exactKey = exactWorkDate.getTime();

  const attendances = prefetch
    ? (prefetch.attendancesByExactWorkDate.get(exactKey) ?? [])
    : await prisma.attendanceRecord.findMany({
        where: { workDate: exactWorkDate },
        include: { employee: true },
      });
  // 同一員工同一日可能有多筆出勤（中間請假二段卡、或跨天拆分）。
  // 績效/工時計算必須以「當日總出勤工時」套用折算規則（新進/儲備/後勤/試作），而不是只取其中一筆。
  const aggregatedAttendanceByEmployeeId = new Map<
    string,
    { employeeId: string; employee: (typeof attendances)[number]["employee"]; originalStoreId: string | null; workHours: number }
  >();
  for (const a of attendances) {
    const prev = aggregatedAttendanceByEmployeeId.get(a.employeeId);
    const origStoreId = prev?.originalStoreId ?? a.originalStoreId ?? null;
    aggregatedAttendanceByEmployeeId.set(a.employeeId, {
      employeeId: a.employeeId,
      employee: a.employee,
      originalStoreId: origStoreId,
      workHours: (prev?.workHours ?? 0) + Number(a.workHours),
    });
  }

  const dispatches = prefetch
    ? (prefetch.dispatchesByExactWorkDate.get(exactKey) ?? [])
    : await prisma.dispatchRecord.findMany({
        where: { workDate: exactWorkDate, confirmStatus: "已確認" },
      });

  const adjustments = prefetch
    ? (prefetch.adjustmentsByExactWorkDate.get(exactKey) ?? [])
    : await prisma.workhourAdjustment.findMany({
        where: { workDate: exactWorkDate },
      });

  const employeeNameById = prefetch
    ? new Map(prefetch.employeeNameById)
    : new Map<string, string>();
  const employeeCodeById = prefetch
    ? new Map(prefetch.employeeCodeById)
    : new Map<string, string>();
  if (!prefetch) {
    for (const a of attendances) {
      if (a.employeeId && a.employee?.name) employeeNameById.set(a.employeeId, a.employee.name);
      if (a.employeeId && a.employee?.employeeCode) {
        employeeCodeById.set(a.employeeId, a.employee.employeeCode);
      }
    }
    const missingNameIds = Array.from(
      new Set(
        [...dispatches.map((x) => x.employeeId), ...adjustments.map((x) => x.employeeId)].filter(
          (id): id is string => Boolean(id) && !employeeNameById.has(id)
        )
      )
    );
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
  }
  const formatEmployee = (employeeId: string) => employeeNameById.get(employeeId) ?? employeeId;

  const activeEmployees = prefetch
    ? prefetch.activeEmployees
    : await prisma.employee.findMany({
        where: { isActive: true },
        select: { id: true, defaultStoreId: true },
      });

  const fallbackHomeStoreByEmployee = prefetch
    ? new Map(prefetch.fallbackHomeStoreByEmployee)
    : new Map<string, string>();
  if (!prefetch) {
    const noDefaultIds = activeEmployees.filter((e) => !e.defaultStoreId).map((e) => e.id);
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
  }
  const assignedByStore = new Map<string, string[]>();
  for (const e of activeEmployees) {
    const homeStoreId = e.defaultStoreId ?? fallbackHomeStoreByEmployee.get(e.id);
    if (!homeStoreId) continue;
    const list = assignedByStore.get(homeStoreId) ?? [];
    list.push(e.id);
    assignedByStore.set(homeStoreId, list);
  }

  function isLeaveShiftType(shiftType: string | null | undefined): boolean {
    const s = (shiftType ?? "").trim();
    if (!s) return false;
    // 常見：特休/事假/病假/公假/補休/喪假/婚假/產假/育嬰等；半天常會含「半」
    // 規則：只要出勤檔標示為任何假別（含半天），就視為「未到齊」。
    return /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(s);
  }

  // 「全店到齊」判斷（儲備人力用）：
  // - 以「名冊上的人當天是否有實際上班（workHours > 0）」判定是否到齊（避免用 8 小時門檻誤傷兼職）
  // - 只要該店名冊上任一人被標示為請假（含半天），也視為未到齊 → 儲備人力 100%
  // - 若有「表定工時」欄（scheduledWorkHours），則以「實際工時 < 表定工時」視為請假/未到齊（可涵蓋請假 2 小時等情境）
  // - 你目前的業務定義：即使是排休，只要沒有調人補進來，也應視為未到齊
  const attendanceEmployeeIds = new Set(
    attendances.filter((a) => Number(a.workHours) > 0).map((a) => a.employeeId)
  );
  const leaveEmployeeIds = new Set(
    attendances
      .filter((a) => {
        const actual = Number(a.workHours);
        const scheduled =
          (a as any).scheduledWorkHours != null ? Number((a as any).scheduledWorkHours) : null;
        const byScheduled =
          scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && actual < scheduled;
        return byScheduled || isLeaveShiftType(a.shiftType);
      })
      .map((a) => a.employeeId)
  );
  const dispatchOutEmployeeIds = new Set(
    dispatches.filter((d) => !!d.fromStoreId).map((d) => d.employeeId)
  );
  // 規則：儲備人力只要當天有「已確認調度」（不論 fromStoreId 是否有填），就不應再做儲備人力折算
  // 目的：避免被調去他店支援時仍被打折，導致原店變成負工時或支援工時被折算。
  const hasConfirmedDispatchByEmployeeId = new Set(dispatches.map((d) => d.employeeId));

  function extractDispatchReason(remark: string | null): string {
    if (!remark) return "";
    const s = remark.trim();
    if (!s) return "";
    return s.split("/")[0].trim();
  }

  const learningOutCountByStoreId = new Map<string, number>();
  const learningInCountByStoreId = new Map<string, number>();
  const otherOutCountByStoreId = new Map<string, number>();
  const backofficeConfirmedByEmployeeId = new Set<string>();
  for (const dr of dispatches) {
    const reason = extractDispatchReason(dr.remark ?? null);
    if (reason === "後勤支援門市" && dr.confirmStatus === "已確認") {
      backofficeConfirmedByEmployeeId.add(dr.employeeId);
    }
    // fromStoreId 可能為 null（填報時未指定），改用出勤記錄的 originalStoreId 或員工 defaultStoreId 作為 fallback
    const resolvedFromStoreId =
      dr.fromStoreId ||
      aggregatedAttendanceByEmployeeId.get(dr.employeeId)?.originalStoreId ||
      null;
    if (resolvedFromStoreId) {
      if (reason === "跨店學習") {
        learningOutCountByStoreId.set(
          resolvedFromStoreId,
          (learningOutCountByStoreId.get(resolvedFromStoreId) ?? 0) + 1
        );
      } else {
        otherOutCountByStoreId.set(
          resolvedFromStoreId,
          (otherOutCountByStoreId.get(resolvedFromStoreId) ?? 0) + 1
        );
      }
    }
    if (reason === "跨店學習") {
      learningInCountByStoreId.set(
        dr.toStoreId,
        (learningInCountByStoreId.get(dr.toStoreId) ?? 0) + 1
      );
    }
  }

  const storeFullByStoreId = new Map<string, boolean>();
  assignedByStore.forEach((empIds, storeId) => {
    // 全店到齊：該門市名冊上的人都在出勤表有出現，且當天沒有調度調出（fromStoreId=該門市）
    const allPresent = empIds.every((id) => attendanceEmployeeIds.has(id));
    const hasLeave = empIds.some((id) => leaveEmployeeIds.has(id));
    const otherOut = otherOutCountByStoreId.get(storeId) ?? 0;
    const learningOut = learningOutCountByStoreId.get(storeId) ?? 0;
    const learningIn = learningInCountByStoreId.get(storeId) ?? 0;
    // 例外：若事由為「跨店學習」且一調出一調入（成對），則仍視為全店到齊
    const learningPaired = learningOut > 0 && learningIn === learningOut;
    const hasNetDispatchOut = otherOut > 0 || (learningOut > 0 && !learningPaired);
    storeFullByStoreId.set(storeId, allPresent && !hasNetDispatchOut && !hasLeave);
  });

  const storeOvertimeByStoreId = new Map<string, number>();
  for (const att of attendances) {
    const storeId =
      att.employee.defaultStoreId ??
      fallbackHomeStoreByEmployee.get(att.employeeId) ??
      att.originalStoreId ??
      null;
    if (!storeId) continue;
    const workH = Number(att.workHours);
    const overtime = Math.max(0, workH - 8);
    storeOvertimeByStoreId.set(storeId, (storeOvertimeByStoreId.get(storeId) ?? 0) + overtime);
  }

  const employeeStores: Map<string, StoreHoursMap> = new Map();
  const dateStr = formatDateOnly(d);
  const reserveSettingsByEmployee = prefetch
    ? new Map(
        Array.from(aggregatedAttendanceByEmployeeId.entries()).map(([employeeId, att]) => [
          employeeId,
          getReserveStaffSettingForEmployeeDate(
            prefetch.reserveSettingsByEmployeeDate,
            employeeId,
            dateStr,
            {
              isReserveStaff: att.employee.isReserveStaff,
              reserveWorkPercent:
                att.employee.reserveWorkPercent == null
                  ? null
                  : Number(att.employee.reserveWorkPercent),
            }
          ),
        ])
      )
    : await getReserveStaffSettingsForDate(d, Array.from(aggregatedAttendanceByEmployeeId.keys()));

  const attendanceDataStartDate = prefetch
    ? prefetch.attendanceDataStartDate
    : await getAttendanceDataStartDate();
  const newHireOffsetOverridesByEmployeeCode = prefetch
    ? prefetch.newHireOffsetOverridesByEmployeeCode
    : await getNewHireOffsetOverridesByEmployeeCode();
  const newHireCandidateIds: string[] = [];
  const hireDateByEmployeeId = new Map<string, Date>();
  const employeeCodeByEmployeeId = new Map<string, string>();
  for (const att of attendances) {
    const codePrefix = (att.employee.employeeCode || "").trim().toLowerCase();
    const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
    if (isTrial) continue;
    if (!att.employee.hireDate) continue;
    if (!(Number(att.workHours) > 0)) continue;
    if (!isEligibleForNewHireWorkPercent(att.employee.hireDate)) continue;
    newHireCandidateIds.push(att.employeeId);
    hireDateByEmployeeId.set(att.employeeId, att.employee.hireDate);
    if (att.employee.employeeCode) employeeCodeByEmployeeId.set(att.employeeId, att.employee.employeeCode);
  }
  const uniqueNewHireCandidateIds = Array.from(new Set(newHireCandidateIds));
  const earliestHireDate = Array.from(hireDateByEmployeeId.values()).reduce<Date | null>(
    (min, v) => {
      const t = toStartOfDay(v);
      if (!min) return t;
      return t.getTime() < min.getTime() ? t : min;
    },
    null
  );
  const workedAttendanceRows =
    uniqueNewHireCandidateIds.length > 0 && earliestHireDate
      ? prefetch
        ? prefetch.workedAttendanceRowsForNewHire.filter(
            (r) =>
              uniqueNewHireCandidateIds.includes(r.employeeId) &&
              r.workDate.getTime() <= exactWorkDate.getTime()
          )
        : await prisma.attendanceRecord.findMany({
            where: {
              employeeId: { in: uniqueNewHireCandidateIds },
              workDate: { gte: earliestHireDate, lte: exactWorkDate },
              workHours: { gt: 0 },
            },
            select: { employeeId: true, workDate: true },
            orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
          })
      : [];
  const workedDayNoIndexByEmployeeId = buildNewHireWorkedDayNoIndex(
    workedAttendanceRows,
    hireDateByEmployeeId,
    attendanceDataStartDate,
    employeeCodeByEmployeeId,
    newHireOffsetOverridesByEmployeeCode
  );

  for (const att of aggregatedAttendanceByEmployeeId.values()) {
    const origStoreId = att.originalStoreId ?? att.employee.defaultStoreId ?? "unknown";
    let hoursValue = Number(att.workHours);
    const isTrial = isTrialEmployeeCode(att.employee.employeeCode || "");

    // 後勤支援門市：不在出勤工時階段折算，改在調度拆分時處理（原店扣全額、支援店加 70%）

    const reserveSetting = reserveSettingsByEmployee.get(att.employeeId) ?? {
      isReserveStaff: att.employee.isReserveStaff,
      reserveWorkPercent:
        att.employee.reserveWorkPercent == null ? null : Number(att.employee.reserveWorkPercent),
    };
    if (reserveSetting.isReserveStaff) {
      const homeStoreId =
        att.employee.defaultStoreId ?? fallbackHomeStoreByEmployee.get(att.employeeId);
      if (!homeStoreId) {
        // 沒有名冊門市也沒有出勤門市 fallback，就無法判定全店狀態，保留原工時
        const hours = new Decimal(hoursValue);
        const storeHours: StoreHoursMap = { [origStoreId]: hours.toNumber() };
        employeeStores.set(att.employeeId, storeHours);
        continue;
      }
      const storeFull = storeFullByStoreId.get(homeStoreId) ?? false;
      const overtimeTotal = storeOvertimeByStoreId.get(homeStoreId) ?? 0;
      const shouldPartial = storeFull && overtimeTotal <= 3;
      const percent = reserveSetting.reserveWorkPercent;
      // 試作人員不套用儲備人力折算
      // 後勤支援門市（70%）也不再疊加儲備人力折算
      if (
        !isTrial &&
        !hasConfirmedDispatchByEmployeeId.has(att.employeeId) &&
        shouldPartial &&
        percent != null &&
        Number.isFinite(percent)
      ) {
        hoursValue = new Decimal(hoursValue).mul(new Decimal(percent).div(100)).toNumber();
      }
    }

    // 新進員工工時折算：依「有上班日」天數套用工時%
    // 第一周(1-5)：0%，第二周(6-10)：50%，第三周(11-15)：70%，第四周(16-20)：90%，滿月(>=21)：100%
    // 到職日在門檻日之前者不套用（與出勤報表一致）
    if (
      !isTrial &&
      att.employee.hireDate &&
      Number(att.workHours) > 0 &&
      isEligibleForNewHireWorkPercent(att.employee.hireDate)
    ) {
      const dateStr = formatDateOnly(d);
      const dayNo = workedDayNoIndexByEmployeeId.get(att.employeeId)?.get(dateStr);
      // 若拿不到「已上班日」天數索引，避免誤套用 0% 造成全員被當成新進員工。
      if (dayNo == null) {
        const hours = new Decimal(hoursValue);
        const storeHours: StoreHoursMap = { [origStoreId]: hours.toNumber() };
        employeeStores.set(att.employeeId, storeHours);
        continue;
      }
      const percent = newHirePercentByWorkedDays(dayNo);
      if (percent !== 1) {
        hoursValue = new Decimal(hoursValue).mul(percent).toNumber();
      }
    }

    const hours = new Decimal(hoursValue);
    const storeHours: StoreHoursMap = { [origStoreId]: hours.toNumber() };
    employeeStores.set(att.employeeId, storeHours);
  }

  for (const disp of dispatches) {
    const fromStoreId =
      disp.fromStoreId ||
      aggregatedAttendanceByEmployeeId.get(disp.employeeId)?.originalStoreId ||
      null;
    let storeHours = employeeStores.get(disp.employeeId);
    if (!storeHours) {
      const seedStoreId = fromStoreId ?? "unknown";
      employeeStores.set(disp.employeeId, { [seedStoreId]: 0 });
      storeHours = employeeStores.get(disp.employeeId)!;
    }

    const fromStoreIdResolved = fromStoreId || Object.keys(storeHours)[0];
    const toStoreId = disp.toStoreId;
    // 績效計算：有填實際時數則用實際時數，否則用預申請時數
    const dispatchH =
      disp.actualHours != null ? Number(disp.actualHours) : Number(disp.dispatchHours);
    const reason = extractDispatchReason(disp.remark ?? null);
    const isBackoffice = reason === "後勤支援門市" && disp.confirmStatus === "已確認";
    if (isBackoffice && disp.actualHours == null) {
      const dateStr = formatDateOnly(d);
      throw new Error(
        `後勤支援門市已確認但未填調度工時：員工 ${formatEmployee(disp.employeeId)}，日期 ${dateStr}`
      );
    }

    const fromCurrent = storeHours[fromStoreIdResolved] ?? 0;
    if (fromCurrent < dispatchH) {
      const dateStr = formatDateOnly(d);
      throw new Error(
        `調度工時大於出勤工時：員工 ${formatEmployee(disp.employeeId)}，日期 ${dateStr}，原店 ${fromCurrent}h，調出 ${dispatchH}h`
      );
    }

    storeHours[fromStoreIdResolved] = fromCurrent - dispatchH;
    if (storeHours[fromStoreIdResolved] < 0) storeHours[fromStoreIdResolved] = 0;
    const toAdd = isBackoffice ? new Decimal(dispatchH).mul(0.7).toNumber() : dispatchH;
    storeHours[toStoreId] = (storeHours[toStoreId] ?? 0) + toAdd;
  }

  // 試作：調度完成後，將「當日有計入工時」的門市改為 -3（避免先變 -3 導致調度無法拆分）
  for (const [employeeId, storeHours] of employeeStores.entries()) {
    if (!isTrialEmployeeCode(employeeCodeById.get(employeeId) ?? "")) continue;
    for (const storeId of Object.keys(storeHours)) {
      if (storeId === "unknown") continue;
      if (Number(storeHours[storeId]) > 0) {
        storeHours[storeId] = -3;
      }
    }
  }

  for (const adj of adjustments) {
    const storeId = adj.storeId || Object.keys(employeeStores.get(adj.employeeId) || {})[0];
    if (!storeId) continue;

    const storeHours = employeeStores.get(adj.employeeId);
    if (!storeHours) {
      employeeStores.set(adj.employeeId, { [storeId]: Number(adj.adjustmentHours) });
      continue;
    }

    const current = storeHours[storeId] ?? 0;
    const after = current + Number(adj.adjustmentHours);
    if (after < 0) {
      throw new Error(
        `調整後工時不得小於 0：員工 ${formatEmployee(adj.employeeId)}，門市 ${storeId}，結果 ${after}h`
      );
    }
    storeHours[storeId] = after;
  }

  return employeeStores;
}

/** 各門市當日加班時數（單筆出勤 >8h 部分，與出勤報表邏輯一致） */
export async function computeStoreOvertimeHoursByStore(
  workDate: Date
): Promise<Record<string, number>> {
  const d = toStartOfDay(workDate);
  const exactWorkDate = businessDayWorkDateFromDate(d);

  const attendances = await prisma.attendanceRecord.findMany({
    where: { workDate: exactWorkDate },
    include: { employee: true },
  });

  const fallbackHomeStoreByEmployee = new Map<string, string>();
  for (const att of attendances) {
    if (att.originalStoreId && !fallbackHomeStoreByEmployee.has(att.employeeId)) {
      fallbackHomeStoreByEmployee.set(att.employeeId, att.originalStoreId);
    }
  }

  const byStore: Record<string, number> = {};
  for (const att of attendances) {
    const storeId =
      att.employee.defaultStoreId ??
      fallbackHomeStoreByEmployee.get(att.employeeId) ??
      att.originalStoreId ??
      null;
    if (!storeId) continue;
    const scheduledHours = resolveScheduledHours(att);
    const overtime = scheduledHours != null ? Math.max(0, Number(att.workHours) - scheduledHours) : 0;
    byStore[storeId] = (byStore[storeId] ?? 0) + overtime;
  }
  return byStore;
}

/** 彙總為各門市當日總工時 */
export async function computeTotalWorkHoursByStore(
  workDate: Date,
  options?: StoreHoursComputeOptions
): Promise<Record<string, number>> {
  const byEmployee = await computeStoreHoursByEmployee(workDate, options);
  const byStore: Record<string, number> = {};

  byEmployee.forEach((storeHours) => {
    for (const [storeId, hours] of Object.entries(storeHours)) {
      if (storeId === "unknown") continue;
      byStore[storeId] = (byStore[storeId] ?? 0) + hours;
    }
  });

  return byStore;
}
