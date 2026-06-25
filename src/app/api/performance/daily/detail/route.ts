import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { businessDayWorkDateFromDate, formatDateOnly, toStartOfDay } from "@/lib/date";
import Decimal from "decimal.js";
import {
  buildNewHireWorkedDayNoIndex,
  getAttendanceDataStartDate,
  getNewHireOffsetOverridesByEmployeeCode,
  isEligibleForNewHireWorkPercent,
  newHirePercentByWorkedDays,
} from "@/lib/attendance-data";
import { computeStoreHoursByEmployee } from "@/modules/performance/services/attendance-allocation.service";
import { getReserveStaffSettingsForDate } from "@/lib/reserve-staff-periods";

export const dynamic = "force-dynamic";

type DetailRowType = "attendance" | "adjustment" | "dispatch_out" | "dispatch_in" | "subtotal";

type DetailRow = {
  type: DetailRowType;
  id: string;
  employeeId: string;
  employeeCode: string;
  name: string;
  workDate: string; // YYYY-MM-DD
  storeId: string;
  workHours: number;
  adjustmentReason: string | null;
};

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  STAFF_SHORTAGE: "人力不足",
  MEETING_REVIEW: "會議/考核",
  RESERVE_STAFF: "儲備人力",
  TRIAL: "試作",
  MANAGER_MEETING: "店長會議",
  PROMOTION_REVIEW: "晉升考核",
  OTHER: "其他",
};

function extractDispatchReason(remark: string | null): string {
  if (!remark) return "";
  const s = remark.trim();
  if (!s) return "";
  return s.split("/")[0].trim();
}

function formatAdjustmentReason(adjustmentType: string, note: string | null): string {
  const label = ADJUSTMENT_TYPE_LABELS[adjustmentType] ?? adjustmentType;
  return note ? `${label}，${note}` : label;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 單一門市單日明細：以出勤表式條列工時 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const storeId = searchParams.get("storeId");
  const parity = searchParams.get("parity");
  if (!date || !storeId) {
    return NextResponse.json(
      { error: "請提供 date 與 storeId" },
      { status: 400 }
    );
  }
  const workDate = toStartOfDay(date);
  const exactWorkDate = businessDayWorkDateFromDate(workDate);

  const [attendancesRaw, dispatches, adjustments] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { workDate: exactWorkDate },
      include: { employee: true },
    }),
    prisma.dispatchRecord.findMany({
      where: { workDate: exactWorkDate, confirmStatus: "已確認" },
    }),
    prisma.workhourAdjustment.findMany({
      where: { workDate: exactWorkDate },
      include: { employee: { select: { id: true, employeeCode: true, name: true, defaultStoreId: true, isReserveStaff: true, reserveWorkPercent: true, hireDate: true } } },
    }),
  ]);

  // 只查 dispatch 涉及的門市名稱，避免全表掃描
  const dispatchStoreIds = [...new Set([
    ...dispatches.map((d) => d.toStoreId),
    ...dispatches.map((d) => d.fromStoreId).filter(Boolean) as string[],
  ])];
  const storeNameById = new Map<string, string>();
  if (dispatchStoreIds.length > 0) {
    const stores = await prisma.store.findMany({
      where: { id: { in: dispatchStoreIds } },
      select: { id: true, name: true },
    });
    for (const s of stores) storeNameById.set(s.id, s.name);
  }

  // 同一員工同日可能多筆出勤 → 先聚合
  const aggregatedAttendanceByEmployeeId = new Map<
    string,
    {
      employeeId: string;
      employee: (typeof attendancesRaw)[number]["employee"];
      originalStoreId: string | null;
      workHours: number;
    }
  >();
  for (const a of attendancesRaw) {
    const prev = aggregatedAttendanceByEmployeeId.get(a.employeeId);
    const origStoreId = prev?.originalStoreId ?? a.originalStoreId ?? null;
    aggregatedAttendanceByEmployeeId.set(a.employeeId, {
      employeeId: a.employeeId,
      employee: a.employee,
      originalStoreId: origStoreId,
      workHours: (prev?.workHours ?? 0) + Number(a.workHours),
    });
  }

  // defaultStore fallback：名冊沒填門市時，用最近一筆出勤原門市當 home store
  const activeEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, defaultStoreId: true, employeeCode: true, name: true, position: true, isReserveStaff: true, reserveWorkPercent: true, hireDate: true },
  });
  const employeeById = new Map(activeEmployees.map((e) => [e.id, e]));
  const noDefaultIds = activeEmployees.filter((e) => !e.defaultStoreId).map((e) => e.id);
  const fallbackHomeStoreByEmployee = new Map<string, string>();
  if (noDefaultIds.length > 0) {
    // 限制查最近 90 天，避免全表掃描
    const cutoff = new Date(workDate);
    cutoff.setDate(cutoff.getDate() - 90);
    const attRecords = await prisma.attendanceRecord.findMany({
      where: {
        employeeId: { in: noDefaultIds },
        originalStoreId: { not: null },
        workDate: { gte: cutoff },
      },
      select: { employeeId: true, originalStoreId: true },
      orderBy: { workDate: "desc" },
    });
    for (const a of attRecords) {
      if (!a.originalStoreId) continue;
      if (fallbackHomeStoreByEmployee.has(a.employeeId)) continue;
      fallbackHomeStoreByEmployee.set(a.employeeId, a.originalStoreId);
    }
  }

  // 儲備人力：全店到齊與加班判斷
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
    return /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(s);
  }
  const attendanceEmployeeIds = new Set(
    attendancesRaw.filter((a) => Number(a.workHours) > 0).map((a) => a.employeeId)
  );
  const leaveEmployeeIds = new Set(
    attendancesRaw
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
  const learningOutCountByStoreId = new Map<string, number>();
  const learningInCountByStoreId = new Map<string, number>();
  const otherOutCountByStoreId = new Map<string, number>();
  const hasConfirmedDispatchByEmployeeId = new Set(dispatches.map((d) => d.employeeId));
  for (const dr of dispatches) {
    const reason = extractDispatchReason(dr.remark ?? null);
    if (dr.fromStoreId) {
      if (reason === "跨店學習") {
        learningOutCountByStoreId.set(
          dr.fromStoreId,
          (learningOutCountByStoreId.get(dr.fromStoreId) ?? 0) + 1
        );
      } else {
        otherOutCountByStoreId.set(
          dr.fromStoreId,
          (otherOutCountByStoreId.get(dr.fromStoreId) ?? 0) + 1
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
  assignedByStore.forEach((empIds, sid) => {
    const allPresent = empIds.every((id) => attendanceEmployeeIds.has(id));
    const hasLeave = empIds.some((id) => leaveEmployeeIds.has(id));
    const otherOut = otherOutCountByStoreId.get(sid) ?? 0;
    const learningOut = learningOutCountByStoreId.get(sid) ?? 0;
    const learningIn = learningInCountByStoreId.get(sid) ?? 0;
    const learningPaired = learningOut > 0 && learningIn === learningOut;
    const hasNetDispatchOut = otherOut > 0 || (learningOut > 0 && !learningPaired);
    storeFullByStoreId.set(sid, allPresent && !hasNetDispatchOut && !hasLeave);
  });
  const storeOvertimeByStoreId = new Map<string, number>();
  for (const att of attendancesRaw) {
    const storeIdForCalc =
      att.employee.defaultStoreId ??
      fallbackHomeStoreByEmployee.get(att.employeeId) ??
      att.originalStoreId ??
      null;
    if (!storeIdForCalc) continue;
    const workH = Number(att.workHours);
    const overtime = Math.max(0, workH - 8);
    storeOvertimeByStoreId.set(
      storeIdForCalc,
      (storeOvertimeByStoreId.get(storeIdForCalc) ?? 0) + overtime
    );
  }

  // 新進員工折算索引
  const attendanceDataStartDate = await getAttendanceDataStartDate();
  const overridesByEmployeeCode = await getNewHireOffsetOverridesByEmployeeCode();
  const newHireCandidateIds: string[] = [];
  const hireDateByEmployeeId = new Map<string, Date>();
  const employeeCodeByEmployeeId = new Map<string, string>();
  for (const att of attendancesRaw) {
    const codePrefix = (att.employee.employeeCode || "").trim().toLowerCase();
    const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
    if (isTrial) continue;
    if (!att.employee.hireDate) continue;
    if (!(Number(att.workHours) > 0)) continue;
    if (!isEligibleForNewHireWorkPercent(att.employee.hireDate)) continue;
    newHireCandidateIds.push(att.employeeId);
    hireDateByEmployeeId.set(att.employeeId, att.employee.hireDate);
    if (att.employee.employeeCode)
      employeeCodeByEmployeeId.set(att.employeeId, att.employee.employeeCode);
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
      ? await prisma.attendanceRecord.findMany({
          where: {
            employeeId: { in: uniqueNewHireCandidateIds },
            workDate: { gte: earliestHireDate, lte: workDate },
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

  // 開始計算 + 記錄明細列
  type StoreHoursMap = Record<string, number>;
  const employeeStores: Map<string, StoreHoursMap> = new Map();
  const events: DetailRow[] = [];
  const ymd = formatDateOnly(workDate);
  const reserveSettingsByEmployee = await getReserveStaffSettingsForDate(
    workDate,
    Array.from(aggregatedAttendanceByEmployeeId.keys())
  );

  for (const att of aggregatedAttendanceByEmployeeId.values()) {
    const emp = employeeById.get(att.employeeId) ?? att.employee;
    const employeeCode = (emp?.employeeCode ?? "").trim();
    const employeeName = (emp?.name ?? "").trim();
    const origStoreId = att.originalStoreId ?? emp?.defaultStoreId ?? "unknown";
    const baseHours = Number(att.workHours);

    // 原出勤工時列
    events.push({
      type: "attendance",
      id: `att-${att.employeeId}-${ymd}`,
      employeeId: att.employeeId,
      employeeCode,
      name: employeeName,
      workDate: ymd,
      storeId: origStoreId,
      workHours: round2(baseHours),
      adjustmentReason: null,
    });

    let hoursValue = baseHours;
    const codePrefix = employeeCode.toLowerCase();
    const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");

    // 儲備人力折算
    const reserveSetting = reserveSettingsByEmployee.get(att.employeeId) ?? {
      isReserveStaff: !!emp?.isReserveStaff,
      reserveWorkPercent:
        emp?.reserveWorkPercent == null ? null : Number(emp.reserveWorkPercent),
    };
    if (reserveSetting.isReserveStaff) {
      const homeStoreId = emp.defaultStoreId ?? fallbackHomeStoreByEmployee.get(att.employeeId) ?? null;
      if (homeStoreId) {
        const storeFull = storeFullByStoreId.get(homeStoreId) ?? false;
        const overtimeTotal = storeOvertimeByStoreId.get(homeStoreId) ?? 0;
        const shouldPartial = storeFull && overtimeTotal <= 3;
        const percent = reserveSetting.reserveWorkPercent;
        if (
          !isTrial &&
          !hasConfirmedDispatchByEmployeeId.has(att.employeeId) &&
          shouldPartial &&
          percent != null &&
          Number.isFinite(percent)
        ) {
          const adjusted = new Decimal(hoursValue).mul(new Decimal(percent).div(100)).toNumber();
          const delta = new Decimal(adjusted).minus(hoursValue).toNumber();
          if (Math.abs(delta) > 0) {
            const percentLabel = round2(percent);
            events.push({
              type: "adjustment",
              id: `reserve-${att.employeeId}-${ymd}`,
              employeeId: att.employeeId,
              employeeCode,
              name: employeeName,
              workDate: ymd,
              storeId: origStoreId,
              workHours: round2(delta),
              adjustmentReason: `儲備人力，計${percentLabel}%工時`,
            });
            hoursValue = adjusted;
          }
        }
      }
    }

    // 新進員工折算
    if (
      !isTrial &&
      emp?.hireDate &&
      baseHours > 0 &&
      isEligibleForNewHireWorkPercent(emp.hireDate)
    ) {
      const dayNo = workedDayNoIndexByEmployeeId.get(att.employeeId)?.get(ymd);
      if (dayNo != null) {
        const percent = newHirePercentByWorkedDays(dayNo);
        if (percent !== 1) {
          const adjusted = new Decimal(hoursValue).mul(percent).toNumber();
          const delta = new Decimal(adjusted).minus(hoursValue).toNumber();
          if (Math.abs(delta) > 0) {
            const percentLabel = Math.round(percent * 10000) / 100;
            events.push({
              type: "adjustment",
              id: `newhire-${att.employeeId}-${ymd}`,
              employeeId: att.employeeId,
              employeeCode,
              name: employeeName,
              workDate: ymd,
              storeId: origStoreId,
              workHours: round2(delta),
              adjustmentReason: `新進員工，計${percentLabel}%工時`,
            });
            hoursValue = adjusted;
          }
        }
      }
    }

    employeeStores.set(att.employeeId, { [origStoreId]: hoursValue });
  }

  // 調度拆分（原店扣、支援店加）
  for (const disp of dispatches) {
    const fromStoreIdSeed =
      disp.fromStoreId ||
      aggregatedAttendanceByEmployeeId.get(disp.employeeId)?.originalStoreId ||
      null;
    let storeHours = employeeStores.get(disp.employeeId);
    if (!storeHours) {
      employeeStores.set(disp.employeeId, { [fromStoreIdSeed ?? "unknown"]: 0 });
      storeHours = employeeStores.get(disp.employeeId)!;
    }
    const emp = employeeById.get(disp.employeeId);
    const employeeCode = (emp?.employeeCode ?? "").trim();
    const employeeName = (emp?.name ?? "").trim();

    const fromStoreId = fromStoreIdSeed || Object.keys(storeHours)[0];
    const toStoreId = disp.toStoreId;
    const dispatchH = disp.actualHours != null ? Number(disp.actualHours) : Number(disp.dispatchHours);
    const reason = extractDispatchReason(disp.remark ?? null);
    const isBackoffice = reason === "後勤支援門市" && disp.confirmStatus === "已確認";
    if (isBackoffice && disp.actualHours == null) {
      throw new Error(`後勤支援門市已確認但未填調度工時：員工 ${employeeCode || disp.employeeId}，日期 ${ymd}`);
    }

    const fromCurrent = storeHours[fromStoreId] ?? 0;
    // 若資料異常（調出 > 原店工時），維持與績效引擎一致：拋錯提示
    if (fromCurrent < dispatchH) {
      throw new Error(
        `調度工時大於出勤工時：員工 ${employeeCode || disp.employeeId}，日期 ${ymd}，原店 ${fromCurrent}h，調出 ${dispatchH}h`
      );
    }

    storeHours[fromStoreId] = fromCurrent - dispatchH;
    if (storeHours[fromStoreId] < 0) storeHours[fromStoreId] = 0;
    events.push({
      type: "dispatch_out",
      id: `disp-out-${disp.id}`,
      employeeId: disp.employeeId,
      employeeCode,
      name: employeeName,
      workDate: ymd,
      storeId: fromStoreId,
      workHours: round2(-dispatchH),
      adjustmentReason:
        isBackoffice ? `後勤支援門市（調出 ${dispatchH}h）` : (disp.remark?.trim() || "支援"),
    });

    const toAdd = isBackoffice ? new Decimal(dispatchH).mul(0.7).toNumber() : dispatchH;
    storeHours[toStoreId] = (storeHours[toStoreId] ?? 0) + toAdd;
    const toStoreName = storeNameById.get(toStoreId) ?? toStoreId;
    events.push({
      type: "dispatch_in",
      id: `disp-in-${disp.id}`,
      employeeId: disp.employeeId,
      employeeCode,
      name: employeeName,
      workDate: ymd,
      storeId: toStoreId,
      workHours: round2(toAdd),
      adjustmentReason:
        isBackoffice ? `後勤支援門市（70%：${round2(toAdd)}h）` : `支援 ${toStoreName}`,
    });
  }

  // 試作：調度後將有計入工時的門市改為 -3，並補上試作異動列
  for (const [employeeId, storeHours] of employeeStores.entries()) {
    const emp = employeeById.get(employeeId);
    const employeeCode = (emp?.employeeCode ?? "").trim();
    const code = employeeCode.toLowerCase();
    const isTrial = code.startsWith("a") || code.startsWith("b");
    if (!isTrial) continue;
    const employeeName = (emp?.name ?? "").trim();
    for (const [storeId, h] of Object.entries(storeHours)) {
      if (storeId === "unknown") continue;
      const current = Number(h);
      if (current <= 0) continue;
      const target = -3;
      const delta = new Decimal(target).minus(current).toNumber();
      if (delta !== 0) {
        events.push({
          type: "adjustment",
          id: `trial-${employeeId}-${ymd}-${storeId}`,
          employeeId,
          employeeCode,
          name: employeeName,
          workDate: ymd,
          storeId,
          workHours: round2(delta),
          adjustmentReason: "試作",
        });
      }
      storeHours[storeId] = target;
    }
  }

  // 人工異動（storeId 為空則 fallback 到該員工當天主要門市）
  for (const adj of adjustments) {
    const storeHours = employeeStores.get(adj.employeeId);
    const primaryStoreId = storeHours ? Object.keys(storeHours)[0] : null;
    const resolvedStoreId = adj.storeId ?? primaryStoreId;
    if (!resolvedStoreId) continue;

    if (!storeHours) {
      employeeStores.set(adj.employeeId, { [resolvedStoreId]: Number(adj.adjustmentHours) });
    } else {
      const current = storeHours[resolvedStoreId] ?? 0;
      const after = current + Number(adj.adjustmentHours);
      if (after < 0) {
        throw new Error(
          `調整後工時不得小於 0：員工 ${adj.employee.employeeCode || adj.employeeId}，門市 ${resolvedStoreId}，結果 ${after}h`
        );
      }
      storeHours[resolvedStoreId] = after;
    }

    events.push({
      type: "adjustment",
      id: `adj-${adj.id}`,
      employeeId: adj.employeeId,
      employeeCode: adj.employee.employeeCode ?? "",
      name: adj.employee.name ?? "",
      workDate: ymd,
      storeId: resolvedStoreId,
      workHours: round2(Number(adj.adjustmentHours)),
      adjustmentReason: formatAdjustmentReason(adj.adjustmentType, adj.note),
    });
  }

  // 小計（每員工每門市）
  employeeStores.forEach((storeHours, empId) => {
    const emp = employeeById.get(empId);
    const employeeCode = (emp?.employeeCode ?? "").trim();
    const employeeName = (emp?.name ?? "").trim();
    for (const [sid, h] of Object.entries(storeHours)) {
      if (!sid || sid === "unknown") continue;
      events.push({
        type: "subtotal",
        id: `sub-${empId}-${ymd}-${sid}`,
        employeeId: empId,
        employeeCode,
        name: employeeName,
        workDate: ymd,
        storeId: sid,
        workHours: round2(Number(h)),
        adjustmentReason: null,
      });
    }
  });

  // 只回傳該門市 rows（UI 會再做分組/排序）
  const rows = events.filter((r) => r.storeId === storeId);

  // 保留舊欄位 detail（單列小計）供相容：取 subtotal
  const detail = rows
    .filter((r) => r.type === "subtotal")
    .map((r) => ({
      employeeId: r.employeeId,
      employeeCode: r.employeeCode,
      name: r.name,
      workHours: r.workHours,
    }));

  let parityCheck:
    | {
        ok: boolean;
        diffCount: number;
        diffs: { employeeId: string; expected: number | null; got: number | null }[];
      }
    | null = null;
  if (parity === "1") {
    try {
      const expectedByEmployee = await computeStoreHoursByEmployee(workDate);
      const expectedMap = new Map<string, number | null>();
      expectedByEmployee.forEach((storeHours, empId) => {
        expectedMap.set(empId, storeHours[storeId] ?? null);
      });
      const gotMap = new Map<string, number | null>();
      for (const r of rows) {
        if (r.type !== "subtotal") continue;
        gotMap.set(r.employeeId, r.workHours ?? null);
      }
      const empIds = Array.from(new Set([...expectedMap.keys(), ...gotMap.keys()]));
      const diffs: { employeeId: string; expected: number | null; got: number | null }[] = [];
      for (const empId of empIds) {
        const e = expectedMap.get(empId) ?? null;
        const g = gotMap.get(empId) ?? null;
        const en = e == null ? null : round2(Number(e));
        const gn = g == null ? null : round2(Number(g));
        if (en === gn) continue;
        // 容忍極小 rounding 誤差
        if (en != null && gn != null && Math.abs(en - gn) <= 0.01) continue;
        diffs.push({ employeeId: empId, expected: en, got: gn });
      }
      parityCheck = { ok: diffs.length === 0, diffCount: diffs.length, diffs: diffs.slice(0, 50) };
    } catch {
      parityCheck = { ok: false, diffCount: -1, diffs: [] };
    }
  }

  return NextResponse.json({
    workDate: ymd,
    storeId,
    storeName: storeNameById.get(storeId) ?? null,
    detail,
    rows,
    parity: parityCheck,
  });
}
