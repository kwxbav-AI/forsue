import { prisma } from "@/lib/prisma";
import { formatDateOnly, toDateRange } from "@/lib/date";
import { mapPerformanceToRetailStore } from "@/modules/operations/services/operations-dashboard-filter.service";

export type OverviewCustomerMetrics = {
  totalCustomerCount: number;
  avgOrderValue: number | null;
  daysWithData: number;
};

/** 區間內來客數與加權平均客單（依營運門市 DailyStorePerformance） */
export async function buildOverviewCustomerMetrics(input: {
  startYmd: string;
  endYmd: string;
  performanceStoreIds: string[];
}): Promise<OverviewCustomerMetrics> {
  if (input.performanceStoreIds.length === 0) {
    return { totalCustomerCount: 0, avgOrderValue: null, daysWithData: 0 };
  }

  const perfToRetail = await mapPerformanceToRetailStore(input.performanceStoreIds);
  const retailIds = [
    ...new Set(
      [...perfToRetail.values()].map((v) => v.retailId).filter(Boolean)
    ),
  ];
  if (retailIds.length === 0) {
    return { totalCustomerCount: 0, avgOrderValue: null, daysWithData: 0 };
  }

  const { start, end } = toDateRange(input.startYmd, input.endYmd);
  const rows = await prisma.dailyStorePerformance.findMany({
    where: {
      storeId: { in: retailIds },
      date: { gte: start, lte: end },
      customerCount: { gt: 0 },
    },
    select: {
      date: true,
      customerCount: true,
      salesAmount: true,
      avgOrderValue: true,
    },
  });

  if (rows.length === 0) {
    return { totalCustomerCount: 0, avgOrderValue: null, daysWithData: 0 };
  }

  let totalCustomers = 0;
  let totalSales = 0;
  const daySet = new Set<string>();

  for (const row of rows) {
    const count = row.customerCount;
    totalCustomers += count;
    daySet.add(formatDateOnly(row.date));
    const sales = Number(row.salesAmount);
    if (sales > 0) {
      totalSales += sales;
    } else if (row.avgOrderValue != null) {
      totalSales += Number(row.avgOrderValue) * count;
    }
  }

  const avgOrderValue =
    totalCustomers > 0 ? Math.round((totalSales / totalCustomers) * 10) / 10 : null;

  return {
    totalCustomerCount: totalCustomers,
    avgOrderValue,
    daysWithData: daySet.size,
  };
}
