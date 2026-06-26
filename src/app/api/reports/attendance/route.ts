import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  toStartOfDay,
} from "@/lib/date";
import {
  buildNewHireWorkedDayNoIndex,
  getAttendanceDataStartDate,
  getNewHireOffsetOverridesByEmployeeCode,
  isEligibleForNewHireWorkPercent,
  newHirePercentByWorkedDays,
} from "@/lib/attendance-data";
import { resolveStoreIdsForAttendanceDepartment } from "@/lib/attendance-region-filter";
import { resolveScheduledHours } from "@/lib/scheduled-hours";
import {
  getReserveStaffSettingForEmployeeDate,
  getReserveStaffSettingsByEmployeeDate,
} from "@/lib/reserve-staff-periods";
import { computeStoreHoursByEmployee } from "@/modules/performance/services/attendance-allocation.service";
import { computeDailyMetricsByStore } from "@/modules/performance/services/daily-store-metrics.service";
import Decimal from "decimal.js";

function listDaysBetweenYmd(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd;
  while (d <= endYmd) {
    out.push(d);
    const dt = parseDateOnlyUTC(d);
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = formatDateOnly(dt);
  }
  return out;
}

export const dynamic = "force-dynamic";

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  STAFF_SHORTAGE: "人力不足",
  MEETING_REVIEW: "會議/考核",
  RESERVE_STAFF: "儲備人力",
  TRIAL: "試作",
  MANAGER_MEETING: "店長會議",
  PROMOTION_REVIEW: "晉升考核",
  OTHER: "其他",
};

export type AttendanceReportRow =
  | {
      type: "attendance";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      scheduledHours: number | null;
      startTime: string | null;
      endTime: string | null;
      adjustmentReason: null;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "adjustment";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      startTime: string | null;
      endTime: string | null;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "dispatch_out";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      startTime: string | null;
      endTime: string | null;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "dispatch_in";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      startTime: string | null;
      endTime: string | null;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "subtotal";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      startTime: string | null;
      endTime: string | null;
      adjustmentReason: null;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const todayStr = formatDateOnlyTaipei();
  const startDate = searchParams.get("startDate") || todayStr;
  const endDate = searchParams.get("endDate") || startDate;
  // simple=true: skip heavy per-day engine computations (computeStoreHoursByEmployee + computeDailyMetricsByStore)
  const simple = searchParams.get("simple") === "true";
  const employeeCode = searchParams.get("employeeCode")?.trim() || "";
  const name = searchParams.get("name")?.trim() || "";
  const department = searchParams.get("department")?.trim() || "";
  const matchStatus = searchParams.get("matchStatus")?.trim() || "";
  const allowedMatchStatus = new Set([
    "MATCH",
    "MISMATCH_CLOCKIN",
    "MISMATCH_CLOCKOUT",
    "MISMATCH_BOTH",
    "DISPATCH_EXPLAINED",
    "NEED_REVIEW",
    "EXCLUDED",
    "UNKNOWN",
  ]);
  const matchStatusFilter = matchStatus && allowedMatchStatus.has(matchStatus) ? matchStatus : "";

  try {
    // Calendar day columns are stored as DATE; query directly by date-only values.
    // Prisma uses JS Date for DATE columns; we keep a stable date-only representation via UTC parsing.
    parseDateOnlyUTC(startDate);
    parseDateOnlyUTC(endDate);
  } catch {
    return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });
  }

  const start = parseDateOnlyUTC(startDate);
  const end = parseDateOnlyUTC(endDate);
  const attendanceWorkDateWhere: Prisma.AttendanceRecordWhereInput = {
    workDate: { gte: start, lte: end },
  };
  const dispatchWorkDateWhere = attendanceWorkDateWhere as unknown as Prisma.DispatchRecordWhereInput;
  const adjustmentWorkDateWhere =
    attendanceWorkDateWhere as unknown as Prisma.WorkhourAdjustmentWhereInput;

  try {
    const activeEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, defaultStoreId: true },
    });
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
    const assignedByStore = new Map<string, string[]>();
    for (const e of activeEmployees) {
      const homeStoreId = e.defaultStoreId ?? fallbackHomeStoreByEmployee.get(e.id);
      if (!homeStoreId) continue;
      const list = assignedByStore.get(homeStoreId) ?? [];
      list.push(e.id);
      assignedByStore.set(homeStoreId, list);
    }

    // 出勤明細需要能顯示「被隱藏門市」的原始出勤資料；此處載入所有啟用門市供顯示/部門篩選
    const allStores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, department: true },
    });
    const storeById = new Map(allStores.map((s) => [s.id, s]));
    const deptToStoreIds = new Map<string, string[]>();
    for (const s of allStores) {
      const dept = (s.department || s.name || "").trim();
      if (!dept) continue;
      if (!deptToStoreIds.has(dept)) deptToStoreIds.set(dept, []);
      deptToStoreIds.get(dept)!.push(s.id);
    }
    const storeIdsForFilter = resolveStoreIdsForAttendanceDepartment(
      department,
      allStores
    );

    const empWhere =
      employeeCode || name
        ? {
            ...(employeeCode
              ? { employeeCode: { contains: employeeCode, mode: "insensitive" as const } }
              : {}),
            ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
          }
        : undefined;

    const recordsRaw = await prisma.attendanceRecord.findMany({
      where: {
        AND: [
          attendanceWorkDateWhere,
          ...(empWhere ? [{ employee: empWhere }] : []),
          ...(storeIdsForFilter && storeIdsForFilter.length > 0
            ? [{ originalStoreId: { in: storeIdsForFilter } }]
            : []),
          ...(matchStatusFilter ? [{ locationMatchStatus: matchStatusFilter as any }] : []),
        ],
      },
      include: {
        employee: { include: { defaultStore: true } },
      },
      orderBy: [{ workDate: "asc" }, { employee: { employeeCode: "asc" } }],
    });

    const recordsById = new Map<string, (typeof recordsRaw)[number]>();
    for (const r of recordsRaw) recordsById.set(r.id, r);
    const records = Array.from(recordsById.values());

    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId))
    ) as string[];
    const reserveSettingsByEmployeeDate = await getReserveStaffSettingsByEmployeeDate(
      start,
      end,
      employeeIds
    );

    // 新進員工折算：改用「實際有上班日」累計天數（workHours > 0 的出勤日）。
    // 為避免在迴圈中逐筆查 DB，先把本次報表涉及的員工在日期區間內的「有上班」出勤日一次撈出來做索引。
    const hireDateByEmployeeId = new Map<string, Date>();
    const employeeCodeByEmployeeId = new Map<string, string>();
    for (const r of records) {
      if (r.employee.hireDate && isEligibleForNewHireWorkPercent(r.employee.hireDate)) {
        hireDateByEmployeeId.set(r.employeeId, r.employee.hireDate);
      }
      if (r.employee.employeeCode) employeeCodeByEmployeeId.set(r.employeeId, r.employee.employeeCode);
    }
    const attendanceDataStartDate = await getAttendanceDataStartDate();
    const overridesByEmployeeCode = await getNewHireOffsetOverridesByEmployeeCode();

    // 關鍵：dayNo 需要「從到職日起累計的有上班日」，不能只用目前報表區間。
    // 若使用 startDate=endDate（查單日），索引只會含那一天，會導致所有人 dayNo=1 → 0%。
    const earliestHireDate = Array.from(hireDateByEmployeeId.values()).reduce<Date | null>(
      (min, v) => {
        if (!min) return v;
        return v.getTime() < min.getTime() ? v : min;
      },
      null
    );
    const workedStart = earliestHireDate ? parseDateOnlyUTC(formatDateOnly(earliestHireDate)) : start;

    const workedAttendanceRows =
      employeeIds.length > 0
        ? await prisma.attendanceRecord.findMany({
            where: {
              employeeId: { in: employeeIds },
              workDate: { gte: workedStart, lte: end },
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
      overridesByEmployeeCode
    );

    const [adjustments, dispatches] = await Promise.all([
      prisma.workhourAdjustment.findMany({
        where: {
          AND: [
            adjustmentWorkDateWhere,
            ...(empWhere ? [{ employee: empWhere }] : []),
          ],
        },
        include: { employee: { include: { defaultStore: true } } },
        orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
      }),
      prisma.dispatchRecord.findMany({
        where: {
          AND: [
            dispatchWorkDateWhere,
            { confirmStatus: "已確認" },
            ...(empWhere ? [{ employee: empWhere }] : []),
            ...(storeIdsForFilter && storeIdsForFilter.length > 0
              ? [
                  {
                    OR: [
                      { fromStoreId: { in: storeIdsForFilter } },
                      { toStoreId: { in: storeIdsForFilter } },
                    ],
                  },
                ]
              : employeeIds.length > 0
                ? [{ employeeId: { in: employeeIds } }]
                : []),
          ],
        },
        include: { employee: true },
        orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
      }),
    ]);

    const extractDispatchReason = (remark: string | null): string => {
      if (!remark) return "";
      const s = remark.trim();
      if (!s) return "";
      return s.split("/")[0].trim();
    };
    const formatAdjustmentReason = (adjustmentType: string, note: string | null): string => {
      const label = ADJUSTMENT_TYPE_LABELS[adjustmentType] ?? adjustmentType;
      return note ? `${label}，${note}` : label;
    };

    // 針對「儲備人力」計算：判定「全店到齊」與「加班總時數」必須看整間店的資料，
    // 不能被姓名/工號搜尋（empWhere）篩到只剩一個人，否則會誤判未到齊。
    const storeFullByDateStore = new Map<string, boolean>();
    const overtimeByDateStore = new Map<string, number>();

    const reserveHomeStoreIds = new Set<string>();
    for (const r of records) {
      const dateStr = formatDateOnly(r.workDate);
      const reserveSetting = getReserveStaffSettingForEmployeeDate(
        reserveSettingsByEmployeeDate,
        r.employeeId,
        dateStr,
        {
          isReserveStaff: r.employee.isReserveStaff,
          reserveWorkPercent:
            r.employee.reserveWorkPercent == null ? null : Number(r.employee.reserveWorkPercent),
        }
      );
      if (!reserveSetting.isReserveStaff) continue;
      const homeStoreId =
        r.employee.defaultStoreId ??
        fallbackHomeStoreByEmployee.get(r.employeeId) ??
        r.originalStoreId ??
        null;
      if (homeStoreId) reserveHomeStoreIds.add(homeStoreId);
    }

    if (reserveHomeStoreIds.size > 0) {
      const datesForCalc = Array.from(
        new Set(records.map((r) => formatDateOnly(r.workDate)))
      );
      const calcEmployeeIds = new Set<string>();
      reserveHomeStoreIds.forEach((sid) => {
        const empIds = assignedByStore.get(sid) ?? [];
        for (const eid of empIds) calcEmployeeIds.add(eid);
      });
      const calcEmployeeIdList = Array.from(calcEmployeeIds);

      const [calcAttendances, calcDispatches] = await Promise.all([
        calcEmployeeIdList.length > 0
          ? prisma.attendanceRecord.findMany({
              where: {
                AND: [attendanceWorkDateWhere, { employeeId: { in: calcEmployeeIdList } }],
              },
              select: {
                workDate: true,
                employeeId: true,
                originalStoreId: true,
                workHours: true,
                scheduledWorkHours: true,
                shiftType: true,
                employee: { select: { defaultStoreId: true } },
              },
              orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
            })
          : [],
        prisma.dispatchRecord.findMany({
          where: {
            AND: [
              dispatchWorkDateWhere,
            ],
            OR: [
              { fromStoreId: { in: Array.from(reserveHomeStoreIds) } },
              { toStoreId: { in: Array.from(reserveHomeStoreIds) } },
            ],
          },
          select: { workDate: true, fromStoreId: true, toStoreId: true, remark: true },
          orderBy: [{ workDate: "asc" }],
        }),
      ]);

      const attendanceIdsByDateStore = new Map<string, Set<string>>();
      const leaveIdsByDateStore = new Map<string, Set<string>>();
      for (const a of calcAttendances) {
        const ds = formatDateOnly(a.workDate);
        const storeId =
          a.employee.defaultStoreId ??
          fallbackHomeStoreByEmployee.get(a.employeeId) ??
          a.originalStoreId ??
          null;
        if (!storeId) continue;
        const k = `${ds}|${storeId}`;
        if (!attendanceIdsByDateStore.has(k)) attendanceIdsByDateStore.set(k, new Set());
        // 到齊判斷：必須有實際上班（workHours > 0）才算到場（避免 8 小時門檻誤傷兼職）
        if (Number(a.workHours) > 0) {
          attendanceIdsByDateStore.get(k)!.add(a.employeeId);
        }

        const st = a.shiftType ? String(a.shiftType).trim() : "";
        const byText = st ? /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(st) : false;
        const scheduled =
          a.scheduledWorkHours != null ? Number(a.scheduledWorkHours) : null;
        const byScheduled =
          scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && Number(a.workHours) < scheduled;
        const isLeave = byText || byScheduled;
        if (isLeave) {
          if (!leaveIdsByDateStore.has(k)) leaveIdsByDateStore.set(k, new Set());
          leaveIdsByDateStore.get(k)!.add(a.employeeId);
        }

        const workH = Number(a.workHours);
        const overtime = Math.max(0, workH - 8);
        overtimeByDateStore.set(k, (overtimeByDateStore.get(k) ?? 0) + overtime);
      }

      const learningOutCountByDateStore = new Map<string, number>();
      const learningInCountByDateStore = new Map<string, number>();
      const otherOutCountByDateStore = new Map<string, number>();
      for (const dr of calcDispatches) {
        const ds = formatDateOnly(dr.workDate);
        const reason = extractDispatchReason(dr.remark ?? null);
        if (dr.fromStoreId) {
          const k = `${ds}|${dr.fromStoreId}`;
          if (reason === "跨店學習") {
            learningOutCountByDateStore.set(k, (learningOutCountByDateStore.get(k) ?? 0) + 1);
          } else {
            otherOutCountByDateStore.set(k, (otherOutCountByDateStore.get(k) ?? 0) + 1);
          }
        }
        if (reason === "跨店學習") {
          const k = `${ds}|${dr.toStoreId}`;
          learningInCountByDateStore.set(k, (learningInCountByDateStore.get(k) ?? 0) + 1);
        }
      }

      for (const ds of datesForCalc) {
        reserveHomeStoreIds.forEach((storeId) => {
          const k = `${ds}|${storeId}`;
          const empIds = assignedByStore.get(storeId) ?? [];
          const presentIds = attendanceIdsByDateStore.get(k) ?? new Set<string>();
          const allPresent = empIds.length > 0 && empIds.every((id) => presentIds.has(id));
          const leaveIds = leaveIdsByDateStore.get(k) ?? new Set<string>();
          const hasLeave = empIds.some((id) => leaveIds.has(id));

          const otherOut = otherOutCountByDateStore.get(k) ?? 0;
          const learningOut = learningOutCountByDateStore.get(k) ?? 0;
          const learningIn = learningInCountByDateStore.get(k) ?? 0;
          const learningPaired = learningOut > 0 && learningIn === learningOut;
          const hasNetDispatchOut = otherOut > 0 || (learningOut > 0 && !learningPaired);

          storeFullByDateStore.set(k, allPresent && !hasNetDispatchOut && !hasLeave);
        });
      }
    }

    if (storeIdsForFilter && storeIdsForFilter.length > 0) {
      const dispatchInOnly = await prisma.dispatchRecord.findMany({
        where: {
          AND: [
            dispatchWorkDateWhere,
            { confirmStatus: "已確認" },
            { toStoreId: { in: storeIdsForFilter } },
            ...(empWhere ? [{ employee: empWhere }] : []),
          ],
        },
        include: { employee: true },
      });
      for (const d of dispatchInOnly) {
        if (!employeeIds.includes(d.employeeId)) employeeIds.push(d.employeeId);
      }
      dispatches.push(...dispatchInOnly);
    }

    // 同一員工同一日可能有多筆出勤（中間請假二段卡、跨天拆分或重複上傳）。
    // 報表以「同日總工時」呈現，避免只抓到其中一段。
    const attByEmpDate = new Map<
      string,
      {
        employeeId: string;
        workDate: Date;
        originalStoreId: string | null;
        department: string | null;
        workHours: number;
        startTime: string | null;
        endTime: string | null;
        locationMatchStatus: string | null;
        clockInStoreText: string | null;
        clockOutStoreText: string | null;
        shiftType: string | null;
        scheduledWorkHours: number | null;
        employee: (typeof records)[number]["employee"];
        id: string; // 取第一筆 id 作為穩定 key
      }
    >();
    for (const r of records) {
      const k = `${r.employeeId}|${formatDateOnly(r.workDate)}`;
      const prev = attByEmpDate.get(k);
      if (!prev) {
        attByEmpDate.set(k, {
          employeeId: r.employeeId,
          workDate: r.workDate,
          originalStoreId: r.originalStoreId ?? null,
          department: r.department ?? null,
          workHours: Number(r.workHours),
          locationMatchStatus: (r as any).locationMatchStatus ?? null,
          startTime: (r as any).startTime ?? null,
          endTime: (r as any).endTime ?? null,
          clockInStoreText: (r as any).clockInStoreText ?? null,
          clockOutStoreText: (r as any).clockOutStoreText ?? null,
          shiftType: (r as any).shiftType ?? null,
          scheduledWorkHours: r.scheduledWorkHours != null ? Number(r.scheduledWorkHours) : null,
          employee: r.employee,
          id: r.id,
        });
      } else {
        attByEmpDate.set(k, {
          ...prev,
          // 以總和為準
          workHours: prev.workHours + Number(r.workHours),
          // 多筆時打卡地點狀態可能不一致；保留原本（最新/第一筆）顯示即可，避免誤導
        });
      }
    }
    const adjByEmpDate = new Map<string, typeof adjustments>();
    for (const a of adjustments) {
      const k = `${a.employeeId}|${formatDateOnly(a.workDate)}`;
      if (!adjByEmpDate.has(k)) adjByEmpDate.set(k, []);
      adjByEmpDate.get(k)!.push(a);
    }
    const dispByEmpDate = new Map<string, typeof dispatches>();
    for (const d of dispatches) {
      const k = `${d.employeeId}|${formatDateOnly(d.workDate)}`;
      if (!dispByEmpDate.has(k)) dispByEmpDate.set(k, []);
      dispByEmpDate.get(k)!.push(d);
    }

    const rows: AttendanceReportRow[] = [];

    const getDept = (
      storeId: string | null,
      emp: any
    ): string => {
      if (storeId) {
        const s = storeById.get(storeId);
        if (s) return (s.department || s.name || "").trim() || "—";
      }
      const def = emp.defaultStore;
      return (def?.department || def?.name || "").trim() || "—";
    };
    const getAdjustmentStoreId = (
      adjustment: (typeof adjustments)[number],
      attStoreId: string | null = null
    ): string | null =>
      adjustment.storeId ??
      attStoreId ??
      adjustment.employee.defaultStoreId ??
      fallbackHomeStoreByEmployee.get(adjustment.employeeId) ??
      null;
    const storeMatchesFilter = (sid: string | null): boolean => {
      if (!storeIdsForFilter) return true;
      if (storeIdsForFilter.length === 0) return false;
      return sid !== null && storeIdsForFilter.includes(sid);
    };

    const isTrialEmployeeCode = (code: string) => {
      const prefix = (code || "").trim().toLowerCase();
      return prefix.startsWith("a") || prefix.startsWith("b");
    };

    // 試作人員：當日有掛在篩選門市的工時異動或調入調度，但出勤 originalStoreId 不在篩選內而未載入時，
    // 仍須載入當日出勤以套用試作列（與有出勤列時一致）。
    const trialEmpIdsNeedingAttendance = new Set<string>();
    for (const a of adjustments) {
      if (!isTrialEmployeeCode(a.employee.employeeCode)) continue;
      if (!storeMatchesFilter(getAdjustmentStoreId(a))) continue;
      const k = `${a.employeeId}|${formatDateOnly(a.workDate)}`;
      if (!attByEmpDate.has(k)) trialEmpIdsNeedingAttendance.add(a.employeeId);
    }
    for (const d of dispatches) {
      const code = d.employee?.employeeCode ?? "";
      if (!isTrialEmployeeCode(code)) continue;
      if (!storeMatchesFilter(d.toStoreId)) continue;
      const k = `${d.employeeId}|${formatDateOnly(d.workDate)}`;
      if (!attByEmpDate.has(k)) trialEmpIdsNeedingAttendance.add(d.employeeId);
    }
    if (trialEmpIdsNeedingAttendance.size > 0) {
      const extraAttendances = await prisma.attendanceRecord.findMany({
        where: {
          AND: [
            attendanceWorkDateWhere,
            { employeeId: { in: Array.from(trialEmpIdsNeedingAttendance) } },
          ],
        },
        include: { employee: { include: { defaultStore: true } } },
      });
      for (const r of extraAttendances) {
        const dateStr = formatDateOnly(r.workDate);
        const k = `${r.employeeId}|${dateStr}`;
        const hasTrialContext =
          adjustments.some(
            (a) =>
              a.employeeId === r.employeeId &&
              formatDateOnly(a.workDate) === dateStr &&
              storeMatchesFilter(getAdjustmentStoreId(a))
          ) ||
          dispatches.some(
            (d) =>
              d.employeeId === r.employeeId &&
              formatDateOnly(d.workDate) === dateStr &&
              storeMatchesFilter(d.toStoreId)
          );
        if (!hasTrialContext) continue;
        const prev = attByEmpDate.get(k);
        if (prev) {
          attByEmpDate.set(k, {
            ...prev,
            workHours: prev.workHours + Number(r.workHours),
          });
        } else {
          attByEmpDate.set(k, {
            employeeId: r.employeeId,
            workDate: r.workDate,
            originalStoreId: r.originalStoreId ?? null,
            department: r.department ?? null,
            workHours: Number(r.workHours),
            locationMatchStatus:
              (r as { locationMatchStatus?: string | null }).locationMatchStatus ?? null,
            startTime: (r as { startTime?: string | null }).startTime ?? null,
            endTime: (r as { endTime?: string | null }).endTime ?? null,
            clockInStoreText: (r as { clockInStoreText?: string | null }).clockInStoreText ?? null,
            clockOutStoreText: (r as { clockOutStoreText?: string | null }).clockOutStoreText ?? null,
            shiftType: (r as { shiftType?: string | null }).shiftType ?? null,
            scheduledWorkHours: (r as { scheduledWorkHours?: unknown }).scheduledWorkHours != null ? Number((r as { scheduledWorkHours?: unknown }).scheduledWorkHours) : null,
            employee: r.employee,
            id: r.id,
          });
        }
      }
    }

    // 試作人員僅有調入、當日無出勤上傳：以調度時數建立虛擬出勤，才能走完整列（試作／小計）
    for (const d of dispatches) {
      const code = d.employee?.employeeCode ?? "";
      if (!isTrialEmployeeCode(code)) continue;
      if (!storeMatchesFilter(d.toStoreId)) continue;
      const dateStr = formatDateOnly(d.workDate);
      const k = `${d.employeeId}|${dateStr}`;
      if (attByEmpDate.has(k)) continue;
      const h =
        d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
      if (!Number.isFinite(h) || h <= 0) continue;
      attByEmpDate.set(k, {
        employeeId: d.employeeId,
        workDate: d.workDate,
        originalStoreId: d.fromStoreId ?? null,
        department: null,
        workHours: 0,
        locationMatchStatus: "UNKNOWN",
        startTime: null,
        endTime: null,
        clockInStoreText: null,
        clockOutStoreText: null,
        shiftType: null,
        scheduledWorkHours: null,
        employee: d.employee as (typeof records)[number]["employee"],
        id: `disp-att-${d.id}`,
      });
    }

    const sortedKeys = new Set<string>();
    for (const r of records) {
      sortedKeys.add(`${r.employeeId}|${formatDateOnly(r.workDate)}`);
    }
    for (const a of adjustments) {
      if (storeMatchesFilter(getAdjustmentStoreId(a))) {
        sortedKeys.add(`${a.employeeId}|${formatDateOnly(a.workDate)}`);
      }
    }
    for (const d of dispatches) {
      if (storeIdsForFilter && storeIdsForFilter.includes(d.toStoreId))
        sortedKeys.add(`${d.employeeId}|${formatDateOnly(d.workDate)}`);
    }
    const sortedKeyList = Array.from(sortedKeys).sort();

    const allocationByDate = new Map<string, Awaited<ReturnType<typeof computeStoreHoursByEmployee>>>();
    if (!simple) {
      const uniqueDatesInReport = Array.from(
        new Set(sortedKeyList.map((k) => k.split("|")[1]))
      );
      await Promise.all(
        uniqueDatesInReport.map(async (dateStr) => {
          allocationByDate.set(
            dateStr,
            await computeStoreHoursByEmployee(toStartOfDay(dateStr))
          );
        })
      );
    }

    const resolveFilteredStoreNet = (
      employeeId: string,
      dateStr: string,
      storeId: string | null
    ): number | null => {
      if (!storeIdsForFilter || !storeId || !storeIdsForFilter.includes(storeId)) {
        return null;
      }
      const byEmp = allocationByDate.get(dateStr);
      const storeHours = byEmp?.get(employeeId);
      if (!storeHours || storeHours[storeId] == null) return null;
      return Math.round(Number(storeHours[storeId]) * 100) / 100;
    };

    for (const key of sortedKeyList) {
      const [empId, dateStr] = key.split("|");
      const att = attByEmpDate.get(key);
      const adjList = adjByEmpDate.get(key) || [];
      const dispList = dispByEmpDate.get(key) || [];

      const emp = att?.employee ?? dispList[0]?.employee ?? adjList[0]?.employee;
      if (!emp) continue;

      const empCode = emp.employeeCode;
      const empName = emp.name;
      const position = emp.position ?? "";

      const storeIdForAtt = att?.originalStoreId ?? emp.defaultStoreId ?? null;
      const deptForAtt = getDept(storeIdForAtt, emp);

      const applyToThisStore = (sid: string | null): boolean => {
        return storeMatchesFilter(sid);
      };

      const attStoreOk = !storeIdsForFilter || (storeIdForAtt && storeIdsForFilter.includes(storeIdForAtt));
      const hasFilteredAdj = adjList.some((a) =>
        applyToThisStore(getAdjustmentStoreId(a, storeIdForAtt))
      );
      const hasFilteredDispIn = dispList.some((d) => applyToThisStore(d.toStoreId));
      const isTrial = isTrialEmployeeCode(empCode);
      const reportWithAttendance =
        !!att && (attStoreOk || (isTrial && (hasFilteredAdj || hasFilteredDispIn)));
      const reportStoreId =
        attStoreOk && storeIdForAtt
          ? storeIdForAtt
          : adjList
              .map((a) => getAdjustmentStoreId(a, storeIdForAtt))
              .find((sid) => applyToThisStore(sid)) ??
            dispList.map((d) => d.toStoreId).find((sid) => applyToThisStore(sid)) ??
            storeIdForAtt;
      const deptForReport = getDept(reportStoreId, emp);

      if (reportWithAttendance) {
        const baseHours = Number(att.workHours);
        let net = baseHours;
        const resolvedScheduled = resolveScheduledHours({
          scheduledWorkHours: att.scheduledWorkHours,
          shiftType: att.shiftType,
          startTime: att.startTime,
          endTime: att.endTime,
        });

        rows.push({
          type: "attendance",
          id: att.id,
          employeeId: emp.id,
          employeeCode: empCode,
          name: empName,
          department: deptForReport,
          position,
          workDate: dateStr,
          workHours: baseHours,
          scheduledHours: resolvedScheduled,
          adjustmentReason: null,
          locationMatchStatus: att.locationMatchStatus ?? null,
          startTime: att.startTime ?? null,
          endTime: att.endTime ?? null,
          clockInStoreText: att.clockInStoreText ?? null,
          clockOutStoreText: att.clockOutStoreText ?? null,
        });

        const hasBackofficeConfirmed = dispList.some((d) => {
          const reason = extractDispatchReason(d.remark ?? null);
          return reason === "後勤支援門市" && d.confirmStatus === "已確認";
        });

        // 儲備人力：保留原工時一行，另新增「儲備人力」調整行（負數），小計才會是折算後工時
        // 規則：儲備人力若當天有已確認調度（被調去他店支援/調出），則不套用儲備人力折算
        // 目的：原店出勤工時會被調度調出抵銷，支援店以 dispatch_in 計入；不應再額外打折造成負工時。
        const hasAnyConfirmedDispatch = dispList.length > 0;
        const reserveSetting = getReserveStaffSettingForEmployeeDate(
          reserveSettingsByEmployeeDate,
          emp.id,
          dateStr,
          {
            isReserveStaff: emp.isReserveStaff,
            reserveWorkPercent:
              emp.reserveWorkPercent == null ? null : Number(emp.reserveWorkPercent),
          }
        );
        if (!isTrial && reserveSetting.isReserveStaff && !hasAnyConfirmedDispatch) {
          const homeStoreId =
            emp.defaultStoreId ?? fallbackHomeStoreByEmployee.get(emp.id) ?? null;
          if (homeStoreId) {
            const k = `${dateStr}|${homeStoreId}`;
            const storeFull = storeFullByDateStore.get(k) ?? false;
            const overtimeTotal = overtimeByDateStore.get(k) ?? 0;
            const percent = reserveSetting.reserveWorkPercent;
            if (
              storeFull &&
              overtimeTotal <= 3 &&
              percent != null &&
              Number.isFinite(percent)
            ) {
              const adjusted = new Decimal(baseHours)
                .mul(new Decimal(percent).div(100))
                .toNumber();
              const delta = new Decimal(adjusted).minus(baseHours).toNumber(); // 通常為負數
              if (Math.abs(delta) > 0) {
                net += delta;
                const percentLabel =
                  Math.round(percent * 100) / 100; // 最多兩位小數
                rows.push({
                  type: "adjustment",
                  id: `reserve-${att.id}`,
                  employeeId: emp.id,
                  employeeCode: empCode,
                  name: empName,
                  department: deptForReport,
                  position,
                  workDate: dateStr,
                  workHours: Math.round(delta * 100) / 100,
                  adjustmentReason: `儲備人力，計${percentLabel}%工時`,
                  locationMatchStatus: null,
                  startTime: null,
                  endTime: null,
                  clockInStoreText: null,
                  clockOutStoreText: null,
                });
              }
            }
          }
        }

        // 新進員工工時折算：依到職天數套用工時%（到職日當天算第 1 天）
        // 到職日在門檻日之前者不套用（僅 >= NEW_HIRE_WORK_PERCENT_ELIGIBLE_MIN_YMD 才可能套用）
        if (!isTrial && emp.hireDate && net > 0 && isEligibleForNewHireWorkPercent(emp.hireDate)) {
          const dayNo = workedDayNoIndexByEmployeeId.get(emp.id)?.get(dateStr);
          // 若拿不到「已上班日」天數索引，避免誤套用 0% 造成全員被當成新進員工
          if (dayNo == null) {
            // 不做新進員工折算
          } else {
          const percent = newHirePercentByWorkedDays(dayNo);
          if (percent !== 1) {
            const adjusted = new Decimal(net).mul(percent).toNumber();
            const delta = new Decimal(adjusted).minus(net).toNumber();
            if (Math.abs(delta) > 0) {
              net += delta;
              const percentLabel = Math.round(percent * 10000) / 100; // 0~100，兩位小數
              rows.push({
                type: "adjustment",
                id: `newhire-${att.id}`,
                employeeId: emp.id,
                employeeCode: empCode,
                name: empName,
                department: deptForReport,
                position,
                workDate: dateStr,
                workHours: Math.round(delta * 100) / 100,
                adjustmentReason: `新進員工，計${percentLabel}%工時`,
                locationMatchStatus: null,
                startTime: null,
                endTime: null,
                clockInStoreText: null,
                clockOutStoreText: null,
              });
            }
          }
          }
        }

        for (const d of dispList) {
          const fromId = d.fromStoreId ?? storeIdForAtt ?? null;
          const toId = d.toStoreId;
          const h = d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
          const reason = extractDispatchReason(d.remark ?? null);
          const isBackoffice = reason === "後勤支援門市" && d.confirmStatus === "已確認";
          const fromInFilter =
            !storeIdsForFilter || (fromId != null && storeIdsForFilter.includes(fromId));
          const toInFilter =
            !storeIdsForFilter || storeIdsForFilter.includes(toId);

          if (isBackoffice && d.actualHours == null && (fromInFilter || toInFilter)) {
            rows.push({
              type: "dispatch_out",
              id: `backoffice-missing-${d.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: deptForReport,
              position,
              workDate: dateStr,
              workHours: 0,
              adjustmentReason: "後勤支援門市（已確認但未填調度工時）",
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
            continue;
          }

          const hIn = isBackoffice ? new Decimal(h).mul(0.7).toNumber() : h;
          const roundedHIn = Math.round(hIn * 100) / 100;

          if (fromInFilter && fromId) {
            net -= h;
            rows.push({
              type: "dispatch_out",
              id: d.id,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: getDept(fromId, emp),
              position,
              workDate: dateStr,
              workHours: -h,
              adjustmentReason: isBackoffice ? `後勤支援門市（調出 ${h}h）` : (d.remark?.trim() || "支援"),
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
          }
          if (toInFilter) {
            net += roundedHIn;
            rows.push({
              type: "dispatch_in",
              id: `in-${d.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: getDept(toId, emp),
              position,
              workDate: dateStr,
              workHours: roundedHIn,
              adjustmentReason: isBackoffice
                ? `後勤支援門市（70%：${roundedHIn}h）`
                : (d.remark?.trim() || "人力支援"),
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
          }
        }

        // 試作：調度後再扣（與績效引擎一致）
        if (isTrial) {
          const beforeTrial = net;
          const target = -3;
          if (beforeTrial > 0) {
            const delta = new Decimal(target).minus(beforeTrial).toNumber();
            net = target;
            rows.push({
              type: "adjustment",
              id: `trial-${att.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: deptForReport,
              position,
              workDate: dateStr,
              workHours: Math.round(delta * 100) / 100,
              adjustmentReason: "試作",
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
          } else if (beforeTrial <= 0 && beforeTrial !== target) {
            const delta = new Decimal(target).minus(beforeTrial).toNumber();
            net = target;
            rows.push({
              type: "adjustment",
              id: `trial-${att.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: deptForReport,
              position,
              workDate: dateStr,
              workHours: Math.round(delta * 100) / 100,
              adjustmentReason: "試作",
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
          }
        }

        for (const a of adjList) {
          const adjStoreId = getAdjustmentStoreId(a, storeIdForAtt);
          if (!applyToThisStore(adjStoreId)) continue;
          const h = Number(a.adjustmentHours);
          net += h;
          const reason = formatAdjustmentReason(a.adjustmentType, a.note);
          rows.push({
            type: "adjustment",
            id: a.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: getDept(adjStoreId, emp),
            position,
            workDate: dateStr,
            workHours: h,
            adjustmentReason: reason,
            locationMatchStatus: null,
            startTime: null,
            endTime: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        const engineNet = resolveFilteredStoreNet(emp.id, dateStr, reportStoreId);
        if (engineNet != null) {
          net = engineNet;
        }

        rows.push({
          type: "subtotal",
          id: `sub-${att.id}`,
          employeeId: emp.id,
          employeeCode: empCode,
          name: empName,
          department: deptForReport,
          position,
          workDate: dateStr,
          workHours: Math.round(net * 100) / 100,
          adjustmentReason: null,
          locationMatchStatus: null,
          startTime: null,
          endTime: null,
          clockInStoreText: null,
          clockOutStoreText: null,
        });
      } else if (adjList.length > 0) {
        let net = 0;
        let emitted = false;
        let deptForAdj = "—";

        for (const d of dispList) {
          if (!storeIdsForFilter || !storeIdsForFilter.includes(d.toStoreId)) continue;
          const h = d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
          const reason = extractDispatchReason(d.remark ?? null);
          const isBackoffice = reason === "後勤支援門市" && d.confirmStatus === "已確認";
          const toStore = storeById.get(d.toStoreId);
          const toDept = toStore ? (toStore.department || toStore.name || "").trim() : "—";
          if (!emitted) deptForAdj = toDept;
          emitted = true;
          if (isBackoffice && d.actualHours == null) {
            rows.push({
              type: "dispatch_in",
              id: `backoffice-missing-${d.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: toDept,
              position,
              workDate: dateStr,
              workHours: 0,
              adjustmentReason: "後勤支援門市（已確認但未填調度工時）",
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
            continue;
          }
          const hIn = isBackoffice ? new Decimal(h).mul(0.7).toNumber() : h;
          const roundedHIn = Math.round(hIn * 100) / 100;
          net += roundedHIn;
          rows.push({
            type: "dispatch_in",
            id: d.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: toDept,
            position,
            workDate: dateStr,
            workHours: roundedHIn,
            adjustmentReason: isBackoffice
              ? `後勤支援門市（70%：${roundedHIn}h）`
              : (d.remark?.trim() || "支援"),
            locationMatchStatus: null,
            startTime: null,
            endTime: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        for (const a of adjList) {
          const adjStoreId = getAdjustmentStoreId(a, storeIdForAtt);
          if (!applyToThisStore(adjStoreId)) continue;
          const h = Number(a.adjustmentHours);
          net += h;
          if (!emitted) deptForAdj = getDept(adjStoreId, emp);
          emitted = true;
          rows.push({
            type: "adjustment",
            id: a.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: getDept(adjStoreId, emp),
            position,
            workDate: dateStr,
            workHours: h,
            adjustmentReason: formatAdjustmentReason(a.adjustmentType, a.note),
            locationMatchStatus: null,
            startTime: null,
            endTime: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        if (emitted) {
          const dispatchToFiltered = dispList.find(
            (d) => !storeIdsForFilter || storeIdsForFilter.includes(d.toStoreId)
          )?.toStoreId;
          const adjStoreForEngine =
            adjList
              .map((a) => getAdjustmentStoreId(a, storeIdForAtt))
              .find((sid) => applyToThisStore(sid)) ??
            reportStoreId ??
            dispatchToFiltered ??
            null;
          const engineNet = resolveFilteredStoreNet(emp.id, dateStr, adjStoreForEngine);
          rows.push({
            type: "subtotal",
            id: `sub-adj-${emp.id}-${dateStr}`,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: deptForAdj,
            position,
            workDate: dateStr,
            workHours: engineNet != null ? engineNet : Math.round(net * 100) / 100,
            adjustmentReason: null,
            locationMatchStatus: null,
            startTime: null,
            endTime: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }
      } else if (storeIdsForFilter && storeIdsForFilter.length > 0) {
        for (const d of dispList) {
          if (!storeIdsForFilter.includes(d.toStoreId)) continue;
          const h = d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
          const reason = extractDispatchReason(d.remark ?? null);
          const isBackoffice = reason === "後勤支援門市" && d.confirmStatus === "已確認";
          if (isBackoffice && d.actualHours == null) {
            rows.push({
              type: "dispatch_in",
              id: `backoffice-missing-${d.id}`,
              employeeId: emp.id,
              employeeCode: empCode,
              name: empName,
              department: "—",
              position,
              workDate: dateStr,
              workHours: 0,
              adjustmentReason: "後勤支援門市（已確認但未填調度工時）",
              locationMatchStatus: null,
              startTime: null,
              endTime: null,
              clockInStoreText: null,
              clockOutStoreText: null,
            });
            continue;
          }
          const hIn = isBackoffice ? new Decimal(h).mul(0.7).toNumber() : h;
          const toStore = storeById.get(d.toStoreId);
          const toDept = toStore ? (toStore.department || toStore.name || "").trim() : "—";
          rows.push({
            type: "dispatch_in",
            id: d.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: toDept,
            position,
            workDate: dateStr,
            workHours: Math.round(hIn * 100) / 100,
            adjustmentReason: isBackoffice
              ? `後勤支援門市（70%：${Math.round(hIn * 100) / 100}h）`
              : (d.remark?.trim() || "支援"),
            locationMatchStatus: null,
            startTime: null,
            endTime: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }
      }
    }

    let engineTotalHours = 0;
    if (!simple) {
      const dayStrs = listDaysBetweenYmd(startDate, endDate);
      for (const ymd of dayStrs) {
        const metrics = await computeDailyMetricsByStore(toStartOfDay(ymd), {
          reportVisibleOnly: true,
        });
        if (storeIdsForFilter && storeIdsForFilter.length > 0) {
          for (const sid of storeIdsForFilter) {
            engineTotalHours += metrics.get(sid)?.laborHours ?? 0;
          }
        } else {
          for (const m of metrics.values()) {
            engineTotalHours += m.laborHours;
          }
        }
      }
      engineTotalHours = Math.round(engineTotalHours * 100) / 100;
    }

    const rowCount = rows.filter(
      (r) => r.type === "attendance" || r.type === "dispatch_in"
    ).length;

    return NextResponse.json({
      rows,
      summary: {
        totalHours: engineTotalHours,
        rowCount,
      },
    });
  } catch (error) {
    console.error("GET /api/reports/attendance failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
