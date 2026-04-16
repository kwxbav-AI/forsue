import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import {
  toStartOfDay,
  toEndOfDay,
  formatDateOnly,
  parseDateOnlyUTC,
  endOfDayUTC,
  addCalendarDaysUTC,
} from "@/lib/date";
import { computeTotalWorkHoursByStore } from "./attendance-allocation.service";
import { getTargetForDate } from "./target-setting.service";

class PerformanceEngineService {
  /** 重算單日各門市績效並寫入 PerformanceDaily（覆蓋當日 versionNo=1） */
  async recalculateDailyPerformance(date: Date): Promise<void> {
    const d = toStartOfDay(date);
    const targetValue = await getTargetForDate(d);
    const storeHours = await computeTotalWorkHoursByStore(d);

    const stores = await prisma.store.findMany({
      where: { isActive: true },
      include: { revenues: { where: { revenueDate: d }, take: 1 } },
    });

    // 內容篇數填報的扣工時：依分店（門市名稱）彙總，從該門市總工時中扣除
    const dateStr = formatDateOnly(d);
    const dayStart = parseDateOnlyUTC(dateStr);
    const dayEnd = endOfDayUTC(dateStr);
    const contentEntries = await prisma.contentEntry.findMany({
      where: { workDate: { gte: dayStart, lte: dayEnd } },
      select: { branch: true, deductedMinutes: true },
    });
    // 以 trim 後門市名稱對應 storeId，避免前後空白導致對不到
    const nameToStore = new Map(
      stores.map((s) => [s.name.trim(), s.id])
    );
    const contentDeductionHoursByStore: Record<string, number> = {};
    for (const entry of contentEntries) {
      const key = entry.branch.trim();
      if (!key) continue;
      const storeId = nameToStore.get(key);
      if (!storeId || entry.deductedMinutes == null) continue;
      contentDeductionHoursByStore[storeId] =
        (contentDeductionHoursByStore[storeId] ?? 0) + entry.deductedMinutes / 60;
    }

    // 效期/清掃 工時：依門市彙總，從該門市總工時中扣除（workDate 以當日區間查詢）
    const storeDeductions = await prisma.storeHourDeduction.findMany({
      where: {
        workDate: { gte: dayStart, lte: dayEnd },
      },
      select: { storeId: true, hours: true },
    });
    const storeDeductionHoursByStore: Record<string, number> = {};
    for (const row of storeDeductions) {
      const h = Number(row.hours);
      if (Number.isFinite(h) && h > 0) {
        storeDeductionHoursByStore[row.storeId] =
          (storeDeductionHoursByStore[row.storeId] ?? 0) + h;
      }
    }

    await prisma.performanceDaily.deleteMany({
      where: { workDate: d, versionNo: 1 },
    });

    const weekDay = d.getUTCDay();
    const rows = stores.map((store) => {
      const rawHours = storeHours[store.id] ?? 0;
      const contentDeduction = contentDeductionHoursByStore[store.id] ?? 0;
      const storeDeduction = storeDeductionHoursByStore[store.id] ?? 0;
      const totalWorkHours = Math.max(0, rawHours - contentDeduction - storeDeduction);
      const revenueRecord = store.revenues[0];
      const revenueAmount = revenueRecord ? Number(revenueRecord.revenueAmount) : 0;
      let efficiencyRatio = 0;
      if (totalWorkHours > 0) {
        efficiencyRatio = new Decimal(revenueAmount).div(totalWorkHours).toNumber();
      }
      let isTargetMet = false;
      if (totalWorkHours > 0) {
        isTargetMet =
          weekDay === 6 ? efficiencyRatio >= 5500 : efficiencyRatio >= 4000;
      }
      return {
        workDate: d,
        storeId: store.id,
        revenueAmount,
        totalWorkHours,
        efficiencyRatio,
        targetValue,
        isTargetMet,
        versionNo: 1,
      };
    });

    if (rows.length > 0) {
      await prisma.performanceDaily.createMany({ data: rows });
    }
  }

  /** 重算日期區間 */
  async recalculateDateRange(startDate: Date, endDate: Date): Promise<void> {
    const start = toStartOfDay(startDate);
    const end = toEndOfDay(endDate);
    let dayStr = formatDateOnly(start);
    const endStr = formatDateOnly(end);
    while (dayStr <= endStr) {
      await this.recalculateDailyPerformance(parseDateOnlyUTC(dayStr));
      dayStr = addCalendarDaysUTC(dayStr, 1);
    }
  }
}

export const performanceEngineService = new PerformanceEngineService();
