import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import {
  toStartOfDay,
  toEndOfDay,
  formatDateOnly,
  parseDateOnlyUTC,
  addCalendarDaysUTC,
  businessDayWorkDateFromDate,
} from "@/lib/date";
import { computeDailyMetricsByStore } from "./daily-store-metrics.service";
import { getTargetForDate } from "./target-setting.service";

class PerformanceEngineService {
  /** 重算單日各門市績效並寫入 PerformanceDaily（覆蓋當日 versionNo=1） */
  async recalculateDailyPerformance(date: Date): Promise<void> {
    const d = toStartOfDay(date);
    const targetValue = await getTargetForDate(d);
    const dailyMetrics = await computeDailyMetricsByStore(d, {
      reportVisibleOnly: false,
    });

    const stores = await prisma.store.findMany({
      where: { isActive: true },
    });

    const weekDay = d.getUTCDay();
    const rows = stores.map((store) => {
      const metrics = dailyMetrics.get(store.id);
      const totalWorkHours = metrics?.laborHours ?? 0;
      const revenueAmount = metrics?.revenue ?? 0;
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

    const exactWorkDate = businessDayWorkDateFromDate(d);

    await prisma.$transaction(async (tx) => {
      await tx.performanceDaily.deleteMany({
        where: { workDate: exactWorkDate, versionNo: 1 },
      });
      if (rows.length > 0) {
        await tx.performanceDaily.createMany({ data: rows });
      }
    });
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
