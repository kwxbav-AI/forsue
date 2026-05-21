import { NextRequest, NextResponse } from "next/server";
import { formatDateOnlyTaipei } from "@/lib/date";
import { OPS_REGION_CATALOG } from "@/lib/operations-dashboard";
import {
  buildEnrichedOverviewStores,
  buildMonthlyRevenueTrend,
  buildOpsKpiMetrics,
} from "@/modules/operations/services/operations-overview-enrich.service";
import { paginateArray, parseApiPagination } from "@/lib/api-pagination";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate")?.trim();
    const endDate = sp.get("endDate")?.trim() || formatDateOnlyTaipei();
    const region = sp.get("region")?.trim() || "";
    const { page, pageSize } = parseApiPagination(sp, { pageSize: 20, maxPageSize: 50 });

    if (!startDate) {
      return NextResponse.json({ error: "請提供 startDate" }, { status: 400 });
    }

    const effective = await resolveEffectiveMetricsDateRange(startDate, endDate);
    const [stores, monthlyTrend, kpiMetrics] = await Promise.all([
      buildEnrichedOverviewStores({
        startYmd: effective.startDate,
        endYmd: effective.endDate,
        region: region || undefined,
      }),
      buildMonthlyRevenueTrend(effective.startDate, effective.endDate),
      buildOpsKpiMetrics(),
    ]);

    const regionStats = OPS_REGION_CATALOG.map((g) => {
      const inRegion = stores.filter((s) => s.region === g.region);
      const revenue = inRegion.reduce((a, s) => a + s.revenue, 0);
      const target = inRegion.reduce((a, s) => a + (s.revenueTarget ?? 0), 0);
      const green = inRegion.filter((s) => s.status === "green").length;
      const yellow = inRegion.filter((s) => s.status === "yellow").length;
      const red = inRegion.filter((s) => s.status === "red").length;
      const withTarget = inRegion.filter((s) => s.status !== "none").length;
      return {
        region: g.region,
        storeCount: inRegion.length,
        revenue,
        target,
        achievementRate:
          target > 0 ? Math.round((revenue / target) * 1000) / 10 : null,
        green,
        yellow,
        red,
        achievementRateStores:
          withTarget > 0 ? Math.round((green / withTarget) * 1000) / 10 : null,
      };
    }).filter((r) => !region || r.region === region);

    const green = stores.filter((s) => s.status === "green").length;
    const yellow = stores.filter((s) => s.status === "yellow").length;
    const red = stores.filter((s) => s.status === "red").length;
    const totalRevenue = stores.reduce((a, s) => a + s.revenue, 0);
    const totalTarget = stores.reduce((a, s) => a + (s.revenueTarget ?? 0), 0);
    const totalLaborHours = stores.reduce((a, s) => a + s.laborHours, 0);
    const withTarget = stores.filter((s) => s.status !== "none").length;

    const withRate = stores.filter((s) => s.revenueAchievementRate != null);
    const topStores = [...withRate]
      .sort((a, b) => (b.revenueAchievementRate ?? 0) - (a.revenueAchievementRate ?? 0))
      .slice(0, 5);
    const bottomStores = [...withRate]
      .sort((a, b) => (a.revenueAchievementRate ?? 0) - (b.revenueAchievementRate ?? 0))
      .slice(0, 5);

    const storesPaged = paginateArray(stores, page, pageSize);

    return NextResponse.json({
      startDate: effective.startDate,
      endDate: effective.endDate,
      region: region || null,
      monthlyTrend,
      kpiMetrics,
      summary: {
        storeCount: stores.length,
        totalRevenue,
        totalTarget,
        totalLaborHours,
        efficiencyRatio: totalLaborHours > 0 ? totalRevenue / totalLaborHours : null,
        revenueAchievementRate:
          totalTarget > 0 ? Math.round((totalRevenue / totalTarget) * 1000) / 10 : null,
        green,
        yellow,
        red,
        achievementRate:
          withTarget > 0 ? Math.round((green / withTarget) * 1000) / 10 : null,
      },
      regionStats,
      topStores,
      bottomStores,
      stores: storesPaged.items,
      storesPagination: storesPaged.pagination,
    });
  } catch (error) {
    console.error("GET /api/operations/overview failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
