import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay, formatDateOnly } from "@/lib/date";
import Decimal from "decimal.js";
import { getTargetForDate } from "@/modules/performance/services/target-setting.service";
import { computeDailyMetricsByStore } from "@/modules/performance/services/daily-store-metrics.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "請提供 date (YYYY-MM-DD)" }, { status: 400 });
  }

  const workDate = toStartOfDay(date);
  const targetValue = await getTargetForDate(workDate);
  const weekDay = workDate.getUTCDay();

  const [stores, metricsByStore] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true, hideInReports: false },
      orderBy: { name: "asc" },
    }),
    computeDailyMetricsByStore(workDate, { reportVisibleOnly: true }),
  ]);

  const list = stores.map((store) => {
    const live = metricsByStore.get(store.id);

    const revenueAmount = live?.revenue ?? 0;
    const totalWorkHours = live?.laborHours ?? 0;

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
      id: `${formatDateOnly(workDate)}-${store.id}`,
      workDate: formatDateOnly(workDate),
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      revenueAmount,
      totalWorkHours,
      efficiencyRatio,
      targetValue,
      isTargetMet,
      calculatedAt: new Date().toISOString(),
    };
  });

  return NextResponse.json(list);
}
