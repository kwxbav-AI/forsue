import { prisma } from "@/lib/prisma";
import {
  businessDayWorkDateFromDate,
  endOfDayUTC,
  formatDateOnly,
  parseDateOnlyUTC,
  toStartOfDay,
} from "@/lib/date";
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
  const businessYmd = formatDateOnly(d);
  const exactWorkDate = businessDayWorkDateFromDate(d);
  const revenueDayStart = parseDateOnlyUTC(businessYmd);
  const revenueDayEnd = endOfDayUTC(businessYmd);
  const storeHours = await computeTotalWorkHoursByStore(d);

  const revenueGrouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: { revenueDate: { gte: revenueDayStart, lte: revenueDayEnd } },
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
    where: { workDate: exactWorkDate },
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
    where: { workDate: exactWorkDate },
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

/** 出勤／調度異常時仍回傳當日營收（工時為 0） */
export async function computeDailyRevenueOnlyByStore(
  workDate: Date,
  options: ComputeOptions = {}
): Promise<Map<string, DailyStoreMetrics>> {
  const { reportVisibleOnly = true } = options;
  const d = toStartOfDay(workDate);
  const businessYmd = formatDateOnly(d);
  const revenueDayStart = parseDateOnlyUTC(businessYmd);
  const revenueDayEnd = endOfDayUTC(businessYmd);

  const revenueGrouped = await prisma.revenueRecord.groupBy({
    by: ["storeId"],
    where: { revenueDate: { gte: revenueDayStart, lte: revenueDayEnd } },
    _sum: { revenueAmount: true },
  });

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...(reportVisibleOnly ? { hideInReports: false } : {}),
    },
    select: { id: true },
  });

  const revenueSumByStoreId = new Map<string, number>();
  for (const g of revenueGrouped) {
    revenueSumByStoreId.set(g.storeId, Number(g._sum.revenueAmount ?? 0));
  }

  const result = new Map<string, DailyStoreMetrics>();
  for (const store of stores) {
    const revenue = revenueSumByStoreId.get(store.id) ?? 0;
    if (revenue > 0) {
      result.set(store.id, { revenue, laborHours: 0 });
    }
  }
  return result;
}

/** 單日計算失敗時降級為僅營收，避免整段區間 API 500 */
export async function computeDailyMetricsByStoreResilient(
  workDate: Date,
  options: ComputeOptions = {}
): Promise<Map<string, DailyStoreMetrics>> {
  try {
    return await computeDailyMetricsByStore(workDate, options);
  } catch (err) {
    console.error(
      `computeDailyMetricsByStore failed for ${formatDateOnly(workDate)}`,
      err
    );
    return computeDailyRevenueOnlyByStore(workDate, options);
  }
}
