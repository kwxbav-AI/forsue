import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { toStartOfDay, formatDateOnly } from "@/lib/date";
import {
  getAttendanceDataStartDate,
  getNewHireOffsetOverridesByEmployeeCode,
  isEligibleForNewHireWorkPercent,
  resolveAssumedWorkedDayOffset,
} from "@/lib/attendance-data";

/** 單一員工單日、依門市拆分後的工時 { storeId: hours } */
export type StoreHoursMap = Record<string, number>;

function newHirePercentByDays(dayNo: number): number {
  if (!Number.isFinite(dayNo) || dayNo <= 0) return 1;
  if (dayNo >= 1 && dayNo <= 5) return 0;
  if (dayNo >= 6 && dayNo <= 10) return 0.5;
  if (dayNo >= 11 && dayNo <= 15) return 0.7;
  if (dayNo >= 16 && dayNo <= 20) return 0.9;
  return 1;
}

async function computeWorkedDaysSinceHireByEmployee(
  workDate: Date,
  employeeIds: string[],
  hireDateByEmployeeId: Map<string, Date>,
  dataStartDate: Date
): Promise<{ totalByEmployeeId: Map<string, number>; beforeStartByEmployeeId: Map<string, number> }> {
  if (employeeIds.length === 0) {
    return { totalByEmployeeId: new Map(), beforeStartByEmployeeId: new Map() };
  }
  const d = toStartOfDay(workDate);

  const earliestHireDate = Array.from(hireDateByEmployeeId.values()).reduce<Date | null>(
    (min, v) => {
      const t = toStartOfDay(v);
      if (!min) return t;
      return t.getTime() < min.getTime() ? t : min;
    },
    null
  );
  if (!earliestHireDate) {
    return { totalByEmployeeId: new Map(), beforeStartByEmployeeId: new Map() };
  }

  const rows = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: { in: employeeIds },
      workDate: { gte: earliestHireDate, lte: d },
      workHours: { gt: 0 },
    },
    select: { employeeId: true, workDate: true },
    orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
  });

  const dateSetByEmployeeId = new Map<string, Set<string>>();
  const beforeStartSetByEmployeeId = new Map<string, Set<string>>();
  const dataStartYmd = formatDateOnly(dataStartDate);
  for (const r of rows) {
    const hire = hireDateByEmployeeId.get(r.employeeId);
    if (!hire) continue;
    if (toStartOfDay(r.workDate).getTime() < toStartOfDay(hire).getTime()) continue;
    const dayStr = formatDateOnly(r.workDate);
    if (!dateSetByEmployeeId.has(r.employeeId)) dateSetByEmployeeId.set(r.employeeId, new Set());
    dateSetByEmployeeId.get(r.employeeId)!.add(dayStr);
    if (dayStr < dataStartYmd) {
      if (!beforeStartSetByEmployeeId.has(r.employeeId)) beforeStartSetByEmployeeId.set(r.employeeId, new Set());
      beforeStartSetByEmployeeId.get(r.employeeId)!.add(dayStr);
    }
  }

  const totalByEmployeeId = new Map<string, number>();
  const beforeStartByEmployeeId = new Map<string, number>();
  for (const [empId, set] of dateSetByEmployeeId.entries()) {
    totalByEmployeeId.set(empId, set.size);
    beforeStartByEmployeeId.set(empId, beforeStartSetByEmployeeId.get(empId)?.size ?? 0);
  }
  return { totalByEmployeeId, beforeStartByEmployeeId };
}

/**
 * Step A: 出勤工時（原店）
 * Step B: 調度拆分（原店減、支援店加）
 * Step C: 人工調整
 * 回傳：每位員工在各門市的最終工時
 */
export async function computeStoreHoursByEmployee(
  workDate: Date
): Promise<Map<string, StoreHoursMap>> {
  const d = toStartOfDay(workDate);

  const attendances = await prisma.attendanceRecord.findMany({
    where: { workDate: d },
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

  const dispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: d, confirmStatus: "已確認" },
  });

  const adjustments = await prisma.workhourAdjustment.findMany({
    where: { workDate: d },
  });

  // 錯誤訊息希望顯示「員工姓名」而不是 id
  const employeeNameById = new Map<string, string>();
  for (const a of attendances) {
    if (a.employeeId && a.employee?.name) employeeNameById.set(a.employeeId, a.employee.name);
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
      select: { id: true, name: true },
    });
    for (const e of emps) {
      if (e.name) employeeNameById.set(e.id, e.name);
    }
  }
  const formatEmployee = (employeeId: string) => employeeNameById.get(employeeId) ?? employeeId;

  // 儲備人力計算規則（以人員名冊的門市為準）
  // - 全店到齊且加班總時數未超過 3H：以 reserveWorkPercent 計部份工時
  // - 全店到齊且加班總時數超過 3H：計 100%
  // - 全店未到齊（含有人員調度調出）：計 100%
  const activeEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, defaultStoreId: true },
  });
  // 有些員工名冊未填門市（defaultStoreId 為 null），但前端會用出勤原門市 fallback 顯示；
  // 這裡也要用同樣 fallback，否則會導致「全店到齊」永遠判不到該店。
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

  // 新進員工工時折算：改用「實際有上班日」累計天數（workHours > 0 的出勤日），而非日曆天。
  // dayNo = 從到職日起算至當日（含當日）累計的「有上班日」天數。
  const attendanceDataStartDate = await getAttendanceDataStartDate();
  const newHireOffsetOverridesByEmployeeCode = await getNewHireOffsetOverridesByEmployeeCode();
  const newHireCandidateIds: string[] = [];
  const hireDateByEmployeeId = new Map<string, Date>();
  for (const att of attendances) {
    const codePrefix = (att.employee.employeeCode || "").trim().toLowerCase();
    const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
    if (isTrial) continue;
    if (!att.employee.hireDate) continue;
    if (!(Number(att.workHours) > 0)) continue;
    if (!isEligibleForNewHireWorkPercent(att.employee.hireDate)) continue;
    newHireCandidateIds.push(att.employeeId);
    hireDateByEmployeeId.set(att.employeeId, att.employee.hireDate);
  }
  const { totalByEmployeeId: workedDaysByEmployeeId, beforeStartByEmployeeId } =
    await computeWorkedDaysSinceHireByEmployee(
    d,
    Array.from(new Set(newHireCandidateIds)),
    hireDateByEmployeeId,
    attendanceDataStartDate
  );

  for (const att of aggregatedAttendanceByEmployeeId.values()) {
    const origStoreId = att.originalStoreId ?? att.employee.defaultStoreId ?? "unknown";
    let hoursValue = Number(att.workHours);

    // 試作規則：員工編號開頭為 A/B（不分大小寫）時，當日工時固定為 -3
    // 目的：在績效/報表中反映「試作扣抵」結果
    const codePrefix = (att.employee.employeeCode || "").trim().toLowerCase();
    const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
    if (isTrial) {
      hoursValue = -3;
    }

    // 後勤支援門市：調度事由為「後勤支援門市」且已確認時，出勤工時以 70% 計
    if (!isTrial && backofficeConfirmedByEmployeeId.has(att.employeeId)) {
      hoursValue = new Decimal(hoursValue).mul(0.7).toNumber();
    }

    if (att.employee.isReserveStaff) {
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
      const percent =
        att.employee.reserveWorkPercent == null
          ? null
          : Number(att.employee.reserveWorkPercent);
      // 試作人員不套用儲備人力折算
      // 後勤支援門市（70%）也不再疊加儲備人力折算
      if (
        !isTrial &&
        !backofficeConfirmedByEmployeeId.has(att.employeeId) &&
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
      const empCode = (att.employee.employeeCode || "").trim();
      const hasOverride = empCode ? newHireOffsetOverridesByEmployeeCode.has(empCode) : false;
      let assumedOffset = resolveAssumedWorkedDayOffset({
        employeeCode: empCode,
        hireDate: att.employee.hireDate,
        dataStartDate: attendanceDataStartDate,
        overridesByEmployeeCode: newHireOffsetOverridesByEmployeeCode,
      });
      const workedDayCount = workedDaysByEmployeeId.get(att.employeeId);
      const actualBeforeStart = beforeStartByEmployeeId.get(att.employeeId) ?? 0;

      // 若資料庫中其實已經有 dataStartDate 以前的出勤日，表示「缺資料」前提不成立：
      // 這時不該再套用 assumedOffset（否則會把 dayNo 又往上推），除非使用者明確設定 override。
      if (!hasOverride && actualBeforeStart > 0) {
        assumedOffset = 0;
      }

      // 若拿不到索引且也沒有 assumedBeforeStart，才視為無法判定（保留原工時，避免誤套 0%）
      if (workedDayCount == null && assumedOffset === 0) {
        const hours = new Decimal(hoursValue);
        const storeHours: StoreHoursMap = { [origStoreId]: hours.toNumber() };
        employeeStores.set(att.employeeId, storeHours);
        continue;
      }
      // 覆寫/補正語意：assumedOffset 代表「資料開始日前應算的累計天數」，用它取代實際資料開始日前的累計，避免雙重計算。
      const total = workedDayCount ?? 0;
      const dayNo = (total - actualBeforeStart) + assumedOffset;
      const percent = newHirePercentByDays(dayNo <= 0 ? 1 : dayNo);
      if (percent !== 1) {
        hoursValue = new Decimal(hoursValue).mul(percent).toNumber();
      }
    }

    const hours = new Decimal(hoursValue);
    const storeHours: StoreHoursMap = { [origStoreId]: hours.toNumber() };
    employeeStores.set(att.employeeId, storeHours);
  }

  for (const disp of dispatches) {
    const storeHours = employeeStores.get(disp.employeeId);
    if (!storeHours) continue;

    const fromStoreId = disp.fromStoreId || Object.keys(storeHours)[0];
    const toStoreId = disp.toStoreId;
    // 績效計算：有填實際時數則用實際時數，否則用預申請時數
    const dispatchH =
      disp.actualHours != null ? Number(disp.actualHours) : Number(disp.dispatchHours);

    const fromCurrent = storeHours[fromStoreId] ?? 0;
    if (fromCurrent < dispatchH) {
      const dateStr = formatDateOnly(d);
      throw new Error(
        `調度工時大於出勤工時：員工 ${formatEmployee(disp.employeeId)}，日期 ${dateStr}，原店 ${fromCurrent}h，調出 ${dispatchH}h`
      );
    }

    storeHours[fromStoreId] = fromCurrent - dispatchH;
    if (storeHours[fromStoreId] < 0) storeHours[fromStoreId] = 0;
    storeHours[toStoreId] = (storeHours[toStoreId] ?? 0) + dispatchH;
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

/** 彙總為各門市當日總工時 */
export async function computeTotalWorkHoursByStore(workDate: Date): Promise<Record<string, number>> {
  const byEmployee = await computeStoreHoursByEmployee(workDate);
  const byStore: Record<string, number> = {};

  byEmployee.forEach((storeHours) => {
    for (const [storeId, hours] of Object.entries(storeHours)) {
      if (storeId === "unknown") continue;
      byStore[storeId] = (byStore[storeId] ?? 0) + hours;
    }
  });

  return byStore;
}
