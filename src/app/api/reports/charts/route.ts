import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, endOfDayUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

function num(x: unknown): number {
  return x == null ? 0 : Number(x);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "請提供 startDate 與 endDate (YYYY-MM-DD)" }, { status: 400 });
  }

  const start = parseDateOnlyUTC(startDate);
  const end = endOfDayUTC(endDate);

  const grouped = await prisma.performanceDaily.groupBy({
    by: ["storeId"],
    where: {
      workDate: { gte: start, lte: end },
      versionNo: 1,
      store: { isActive: true },
    },
    _sum: {
      revenueAmount: true,
      totalWorkHours: true,
    },
  });

  const storeIds = grouped.map((g) => g.storeId);
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, code: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const perStore = grouped
    .map((g) => {
      const revenueSum = num(g._sum.revenueAmount);
      const hoursSum = num(g._sum.totalWorkHours);
      const efficiencyRatio = hoursSum > 0 ? revenueSum / hoursSum : null;
      const store = storeMap.get(g.storeId);
      return {
        storeId: g.storeId,
        storeName: store?.name ?? g.storeId,
        storeCode: store?.code ?? null,
        revenueSum,
        hoursSum,
        efficiencyRatio,
      };
    })
    .sort((a, b) => (b.efficiencyRatio ?? -Infinity) - (a.efficiencyRatio ?? -Infinity));

  const totalsRevenue = perStore.reduce((acc, r) => acc + r.revenueSum, 0);
  const totalsHours = perStore.reduce((acc, r) => acc + r.hoursSum, 0);
  const totalsRatio = totalsHours > 0 ? totalsRevenue / totalsHours : null;

  return NextResponse.json({
    startDate,
    endDate,
    perStore,
    totals: {
      revenueSum: totalsRevenue,
      hoursSum: totalsHours,
      efficiencyRatio: totalsRatio,
    },
  });
}

