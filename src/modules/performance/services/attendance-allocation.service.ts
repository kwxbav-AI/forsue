import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { toStartOfDay, formatDateOnly } from "@/lib/date";

/** 單一員工單日、依門市拆分後的工時 { storeId: hours } */
export type StoreHoursMap = Record<string, number>;

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

  const dispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: d },
  });

  const adjustments = await prisma.workhourAdjustment.findMany({
    where: { workDate: d },
  });

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

  const attendanceEmployeeIds = new Set(attendances.map((a) => a.employeeId));
  const dispatchOutEmployeeIds = new Set(
    dispatches.filter((d) => !!d.fromStoreId).map((d) => d.employeeId)
  );

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
    const otherOut = otherOutCountByStoreId.get(storeId) ?? 0;
    const learningOut = learningOutCountByStoreId.get(storeId) ?? 0;
    const learningIn = learningInCountByStoreId.get(storeId) ?? 0;
    // 例外：若事由為「跨店學習」且一調出一調入（成對），則仍視為全店到齊
    const learningPaired = learningOut > 0 && learningIn === learningOut;
    const hasNetDispatchOut = otherOut > 0 || (learningOut > 0 && !learningPaired);
    storeFullByStoreId.set(storeId, allPresent && !hasNetDispatchOut);
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

  for (const att of attendances) {
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
        shouldPartial &&
        percent != null &&
        Number.isFinite(percent)
      ) {
        hoursValue = new Decimal(hoursValue).mul(new Decimal(percent).div(100)).toNumber();
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
        `調度工時大於出勤工時：員工 ${disp.employeeId}，日期 ${dateStr}，原店 ${fromCurrent}h，調出 ${dispatchH}h`
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
        `調整後工時不得小於 0：員工 ${adj.employeeId}，門市 ${storeId}，結果 ${after}h`
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
