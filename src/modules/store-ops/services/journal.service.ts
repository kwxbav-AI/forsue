import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import type { AuthContext } from "@/lib/auth-context";

export type JournalMonthlyStats = {
  storeId: string;
  storeName: string;
  month: string;
  totalRevenue: number;
  avgDailyRevenue: number;
  customerFlow: number;
  submittedDays: number;
  totalBusinessDays: number;
  completionRate: number;
  restockDoneCount: number;
  restockRate: number;
  expiryDoneCount: number;
  expiryRate: number;
};

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function avg(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round(total / days);
}

export async function computeJournalMonthlyStats(
  ctx: AuthContext,
  month: string,
  requestedStoreId?: string | null
): Promise<JournalMonthlyStats[]> {
  const [year, mon] = month.split("-").map(Number);
  const { startYmd, endYmd } = monthStartEndYmd(year, mon);
  const startDate = parseDateOnlyUTC(startYmd);
  const endDate = parseDateOnlyUTC(endYmd);

  const storeWhere =
    ctx.allowedStoreIds === null ?
      requestedStoreId?.trim() ?
        { id: requestedStoreId.trim(), isActive: true }
      : { isActive: true }
    : ctx.allowedStoreIds.length > 0 ?
      requestedStoreId?.trim() ?
        { id: requestedStoreId.trim(), isActive: true }
      : { id: { in: ctx.allowedStoreIds }, isActive: true }
    : { id: "__none__" };

  const stores = await prisma.retailStore.findMany({
    where: storeWhere,
    select: { id: true, storeName: true },
    orderBy: { storeName: "asc" },
  });

  if (stores.length === 0) return [];

  const storeIds = stores.map((s) => s.id);

  const [reports, performances] = await Promise.all([
    prisma.dailyReport.findMany({
      where: {
        storeId: { in: storeIds },
        reportDate: { gte: startDate, lte: endDate },
      },
      select: {
        storeId: true,
        status: true,
        revenue: true,
        restockDone: true,
        expiryDone: true,
      },
    }),
    prisma.dailyStorePerformance.findMany({
      where: {
        storeId: { in: storeIds },
        date: { gte: startDate, lte: endDate },
      },
      select: { storeId: true, customerCount: true },
    }),
  ]);

  const reportsByStore = new Map<string, typeof reports>();
  for (const r of reports) {
    const list = reportsByStore.get(r.storeId) ?? [];
    list.push(r);
    reportsByStore.set(r.storeId, list);
  }

  const perfByStore = new Map<string, typeof performances>();
  for (const p of performances) {
    const list = perfByStore.get(p.storeId) ?? [];
    list.push(p);
    perfByStore.set(p.storeId, list);
  }

  return stores.map((store) => {
    const storeReports = reportsByStore.get(store.id) ?? [];
    const storePerfs = perfByStore.get(store.id) ?? [];
    const submitted = storeReports.filter((r) => r.status === "SUBMITTED");
    const submittedDays = submitted.length;
    const totalBusinessDays = storePerfs.length;
    const totalRevenue = storeReports.reduce((sum, r) => sum + (r.revenue ?? 0), 0);
    const customerFlow = storePerfs.reduce((sum, p) => sum + p.customerCount, 0);
    const restockDoneCount = submitted.filter((r) => r.restockDone).length;
    const expiryDoneCount = submitted.filter((r) => r.expiryDone).length;

    return {
      storeId: store.id,
      storeName: store.storeName,
      month,
      totalRevenue,
      avgDailyRevenue: avg(totalRevenue, totalBusinessDays),
      customerFlow,
      submittedDays,
      totalBusinessDays,
      completionRate: pct(submittedDays, totalBusinessDays),
      restockDoneCount,
      restockRate: pct(restockDoneCount, submittedDays),
      expiryDoneCount,
      expiryRate: pct(expiryDoneCount, submittedDays),
    };
  });
}
