import { NextRequest, NextResponse } from "next/server";
import { fetchChartsPerStore } from "@/modules/operations/services/operations-metrics.service";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "請提供 startDate 與 endDate (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const effective = await resolveEffectiveMetricsDateRange(startDate, endDate);
    const perStore = (
      await fetchChartsPerStore(effective.startDate, effective.endDate)
    ).sort(
      (a, b) =>
        (b.efficiencyRatio ?? -Infinity) - (a.efficiencyRatio ?? -Infinity)
    );

    const totalsRevenue = perStore.reduce((acc, r) => acc + r.revenueSum, 0);
    const totalsHours = perStore.reduce((acc, r) => acc + r.hoursSum, 0);
    const totalsRatio = totalsHours > 0 ? totalsRevenue / totalsHours : null;

    return NextResponse.json({
      startDate: effective.startDate,
      endDate: effective.endDate,
      requestedStartDate: startDate,
      requestedEndDate: endDate,
      dataStartYmd: effective.dataStartYmd,
      dateRangeClamped: effective.clamped,
      perStore,
      totals: {
        revenueSum: totalsRevenue,
        hoursSum: totalsHours,
        efficiencyRatio: totalsRatio,
      },
    });
  } catch (error) {
    console.error("GET /api/reports/charts failed", error);
    return NextResponse.json(
      { error: "查詢失敗，請縮短日期區間或稍後再試" },
      { status: 500 }
    );
  }
}
