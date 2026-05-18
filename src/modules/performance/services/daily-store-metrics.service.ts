import { prisma } from "@/lib/prisma";
import { calendarDayBoundsFromDate, toStartOfDay } from "@/lib/date";
import { computeTotalWorkHoursByStore } from "./attendance-allocation.service";

export type DailyStoreMetrics = {
  revenue: number;
  laborHours: number;
};

type ComputeOptions = {
  /** 圖表／報表僅含未隱藏門市；重算寫入 PerformanceDaily 時為 false */
  reportVisibleOnly?: boolean;
};

/** 單日各門市營收與工時（與績效重算／圖表相同公式，不寫入 DB） */
export async function computeDailyMetricsByStore(
  workDate: Date,
  options: ComputeOptions = {}
): Promise<Map<string, DailyStoreMetrics>> {
  const { reportVisibleOnly = true } = options;
  const d = toStartOfDay(workDate);
  const { start: dayStart, end: dayEnd } = calendarDayBoundsFromDate(d);
  const storeHours = await computeTotalWorkHoursByStore(d);

  const revenueGrouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: { revenueDate: { gte: dayStart, lte: dayEnd } },
    _sum: { revenueAmount: true },
  });
  const revenueSumByStoreId = new Map<string, number>();
  for (const g of revenueGrouped) {
    revenueSumByStoreId.set(g.storeId, Number(g._sum.revenueAmount ?? 0));
  }

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...(reportVisibleOnly ? { hideInReports: false } : {}),
    },
    select: { id: true, name: true },
  });

  const contentEntries = await prisma.contentEntry.findMany({
    where: { workDate: { gte: dayStart, lte: dayEnd } },
    select: { branch: true, deductedMinutes: true },
  });
  const nameToStore = new Map<string, string>();
  for (const s of stores) {
    const key = s.name.trim();
    nameToStore.set(key, s.id);
    if (!key.endsWith("店")) {
      nameToStore.set(`${key}店`, s.id);
    }
  }
  const contentDeductionHoursByStore: Record<string, number> = {};
  for (const entry of contentEntries) {
    const key = entry.branch.trim();
    if (!key) continue;
    const storeId =
      nameToStore.get(key) ?? nameToStore.get(key.replace(/店$/, ""));
    if (!storeId || entry.deductedMinutes == null) continue;
    contentDeductionHoursByStore[storeId] =
      (contentDeductionHoursByStore[storeId] ?? 0) + entry.deductedMinutes / 60;
  }

  const storeDeductions = await prisma.storeHourDeduction.findMany({
    where: { workDate: { gte: dayStart, lte: dayEnd } },
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

  const result = new Map<string, DailyStoreMetrics>();
  for (const store of stores) {
    const rawHours = storeHours[store.id] ?? 0;
    const contentDeduction = contentDeductionHoursByStore[store.id] ?? 0;
    const storeDeduction = storeDeductionHoursByStore[store.id] ?? 0;
    const laborHours = Math.max(0, rawHours - contentDeduction - storeDeduction);
    const revenue = revenueSumByStoreId.get(store.id) ?? 0;
    result.set(store.id, { revenue, laborHours });
  }

  return result;
}
