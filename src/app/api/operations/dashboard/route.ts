import { NextRequest, NextResponse } from "next/server";
import { parseDateOnlyUTC, formatDateOnly, formatDateOnlyTaipei } from "@/lib/date";
import { DUAL_OPS_REGIONS, OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import {
  buildDashboardFilterResult,
  fetchPriorYearChartsForFilter,
} from "@/modules/operations/services/operations-dashboard-filter.service";
import {
  fetchChartsPerStore,
  fetchDualRegionChartTotals,
  fetchDualRegionTotalsFromPerformanceDaily,
  filterChartsByCatalogRegions,
  getOpsCatalogStoreCount,
  listPerformanceStoresForFilter,
  sumChartRows,
} from "@/modules/operations/services/operations-metrics.service";
import {
  clampMetricsDateRange,
  getPerformanceMetricsDataStartYmd,
} from "@/lib/performance-metrics-range";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
}

function rangesEqual(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string }
): boolean {
  return a.startDate === b.startDate && a.endDate === b.endDate;
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate")?.trim();
    const endDate = sp.get("endDate")?.trim();
    const region = sp.get("region")?.trim() || "";
    const storeId = sp.get("storeId")?.trim() || "";

    const filterStores = await listPerformanceStoresForFilter();
    const regions = [...OPS_FILTER_REGIONS];

    const meta = {
      activeStoreCount: filterStores.length,
      regions,
      stores: filterStores,
      dualRegions: [...DUAL_OPS_REGIONS],
      dataSource: "reports-charts",
      dataSourceNote:
        "與「圖表」相同公式（/api/reports/charts）；KPI 自 2026-04-01 累計至今日",
    };

    if (!startDate || !endDate) {
      return NextResponse.json({ meta });
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "開始日不可晚於結束日" },
        { status: 400 }
      );
    }

    const effectiveRange = await resolveEffectiveMetricsDateRange(
      startDate,
      endDate
    );
    const dataStartYmd = await getPerformanceMetricsDataStartYmd();
    const todayYmd = formatDateOnlyTaipei();
    const kpiRange = clampMetricsDateRange(
      dataStartYmd,
      todayYmd,
      dataStartYmd
    );

    const [perStore, priorPerStore] = await Promise.all([
      fetchChartsPerStore(effectiveRange.startDate, effectiveRange.endDate),
      fetchPriorYearChartsForFilter(
        effectiveRange.startDate,
        effectiveRange.endDate,
        (ymd, delta) => shiftYear(ymd, delta)
      ),
    ]);

    let dualCurrent;
    if (rangesEqual(kpiRange, effectiveRange)) {
      const rows = filterChartsByCatalogRegions(perStore, DUAL_OPS_REGIONS);
      dualCurrent = sumChartRows(rows);
    } else {
      dualCurrent = await fetchDualRegionChartTotals(
        kpiRange.startDate,
        kpiRange.endDate
      );
    }

    let dualPrior = { revenue: 0, laborHours: 0, efficiencyRatio: null as number | null };
    let kpiYoyGrowthRate: number | null = null;
    try {
      dualPrior = await fetchDualRegionTotalsFromPerformanceDaily(
        shiftYear(kpiRange.startDate, -1),
        shiftYear(
          effectiveRange.endDate < todayYmd ? effectiveRange.endDate : todayYmd,
          -1
        )
      );
      if (dualPrior.revenue > 0) {
        kpiYoyGrowthRate =
          ((dualCurrent.revenue - dualPrior.revenue) / dualPrior.revenue) * 100;
      }
    } catch (yoyErr) {
      console.warn("YoY snapshot query skipped", yoyErr);
    }

    const selectedStore = storeId
      ? filterStores.find((s) => s.id === storeId)
      : null;

    const filterLabel = selectedStore
      ? selectedStore.storeName
      : region || "全部門市";

    const filteredStoreCount = storeId
      ? 1
      : getOpsCatalogStoreCount(region || undefined);

    const filteredResult = await buildDashboardFilterResult({
      perStore,
      priorPerStore,
      startYmd: effectiveRange.startDate,
      endYmd: effectiveRange.endDate,
      filterLabel,
      storeCount: filteredStoreCount,
      selection: {
        storeId: storeId || undefined,
        region: storeId ? undefined : region || undefined,
        storeLabel: selectedStore?.storeName,
        catalogKey: selectedStore?.catalogKey,
      },
      applyOpsCatalogWhenEmpty: !storeId && !region,
    });

    return NextResponse.json({
      meta,
      query: {
        startDate: effectiveRange.startDate,
        endDate: effectiveRange.endDate,
        requestedStartDate: startDate,
        requestedEndDate: endDate,
        dataStartYmd: effectiveRange.dataStartYmd,
        dateRangeClamped: effectiveRange.clamped,
        region: region || null,
        storeId: storeId || null,
      },
      kpiMetrics: {
        totalRevenue: dualCurrent.revenue,
        totalLaborHours: dualCurrent.laborHours,
        efficiencyRatio: dualCurrent.efficiencyRatio,
        yoyGrowthRate: kpiYoyGrowthRate,
        priorYearRevenue: dualPrior.revenue,
        regionLabel: "桃園區 + 宜蘭區",
        periodStartDate: kpiRange.startDate,
        periodEndDate: kpiRange.endDate,
      },
      filteredMetrics: {
        totalRevenue: filteredResult.summary.revenue,
        totalLaborHours: filteredResult.summary.laborHours,
        efficiencyRatio: filteredResult.summary.efficiencyRatio,
        filterLabel: filteredResult.filterLabel,
        storeCount: filteredResult.storeCount,
        matchedStoreCount: filteredResult.matchedStoreCount,
        hasData: filteredResult.hasData,
        revenueForecast: filteredResult.summary.revenueForecast,
        revenueAchievement: filteredResult.summary.revenueAchievement,
        revenueAchievementRate: filteredResult.summary.revenueAchievementRate,
        yoyGrowthRate: filteredResult.summary.yoyGrowthRate,
        priorYearRevenue: filteredResult.summary.priorYearRevenue,
        actualAttendanceHours: filteredResult.summary.actualAttendanceHours,
        overtimeHours: filteredResult.summary.overtimeHours,
        overtimeRatio: filteredResult.summary.overtimeRatio,
        dailyBusinessHours: filteredResult.summary.dailyBusinessHours,
        defaultLaborHours: filteredResult.summary.defaultLaborHours,
        stores: filteredResult.stores,
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("GET /api/operations/dashboard failed", error);
    return NextResponse.json(
      {
        error: "查詢失敗，請縮短日期區間或稍後再試",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
