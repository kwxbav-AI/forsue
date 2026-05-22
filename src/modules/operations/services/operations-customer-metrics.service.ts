import { prisma } from "@/lib/prisma";
import { formatDateOnly, toDateRange } from "@/lib/date";

export type OverviewCustomerMetrics = {
  totalCustomerCount: number;
  avgOrderValue: number | null;
  daysWithData: number;
};

const EMPTY_METRICS: OverviewCustomerMetrics = {
  totalCustomerCount: 0,
  avgOrderValue: null,
  daysWithData: 0,
};

/** 區間內來客數與加權平均客單（依營運門市 DailyStorePerformance） */
export async function aggregateCustomerMetricsForRetailIds(
  retailIds: string[],
  startYmd: string,
  endYmd: string
): Promise<OverviewCustomerMetrics> {
  if (retailIds.length === 0) return EMPTY_METRICS;

  const { start, end } = toDateRange(startYmd, endYmd);
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

  if (rows.length === 0) return EMPTY_METRICS;

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
