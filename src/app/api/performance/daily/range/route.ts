import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeStoreKey,
  storeNameMatchesCatalogKey,
} from "@/lib/operations-dashboard";
import {
  aggregateStoreMetricsForRange,
  resolveEffectiveMetricsDateRange,
  sumPerformanceDailyRangeRows,
} from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";

/** 區間加總（與每日工效比逐日資料加總相同） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const storeId = searchParams.get("storeId")?.trim() || "";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "請提供 startDate 與 endDate (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (startDate > endDate) {
    return NextResponse.json(
      { error: "開始日不可晚於結束日" },
      { status: 400 }
    );
  }

  try {
    const effective = await resolveEffectiveMetricsDateRange(startDate, endDate);
    let perStore = await aggregateStoreMetricsForRange(
      effective.startDate,
      effective.endDate
    );
    if (storeId) {
      let matched = perStore.filter((r) => r.storeId === storeId);
      if (matched.length === 0) {
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { name: true },
        });
        if (store) {
          const key = normalizeStoreKey(store.name);
          matched = perStore.filter(
            (r) =>
              storeNameMatchesCatalogKey(r.storeName, key) ||
              normalizeStoreKey(r.storeName) === key
          );
        }
      }
      perStore = matched;
    }

    const totals = sumPerformanceDailyRangeRows(perStore);

    return NextResponse.json({
      startDate: effective.startDate,
      endDate: effective.endDate,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      dataStartYmd: effective.dataStartYmd,
      dateRangeClamped: effective.clamped,
      storeId: storeId || null,
      perStore,
      totals: {
        revenueSum: totals.revenue,
        hoursSum: totals.laborHours,
        efficiencyRatio: totals.efficiencyRatio,
      },
    });
  } catch (error) {
    console.error("GET /api/performance/daily/range failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
