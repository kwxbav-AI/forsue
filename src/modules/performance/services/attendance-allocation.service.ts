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

  const employeeStores: Map<string, StoreHoursMap> = new Map();

  for (const att of attendances) {
    const origStoreId = att.originalStoreId ?? att.employee.defaultStoreId ?? "unknown";
    const hours = new Decimal(Number(att.workHours));
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

  for (const storeHours of byEmployee.values()) {
    for (const [storeId, hours] of Object.entries(storeHours)) {
      if (storeId === "unknown") continue;
      byStore[storeId] = (byStore[storeId] ?? 0) + hours;
    }
  }

  return byStore;
}
