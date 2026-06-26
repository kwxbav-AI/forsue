import { NextRequest, NextResponse } from "next/server";
import { parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { DUAL_OPS_REGIONS, OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import {
  buildDashboardFilterResult,
  fetchPriorYearChartsForFilter,
} from "@/modules/operations/services/operations-dashboard-filter.service";
import { yoyGrowthRate } from "@/lib/operations-yoy";
import {
  fetchChartsPerStore,
  fetchDualRegionRevenueTotal,
  filterChartsByCatalogRegions,
  getOpsCatalogStoreCount,
  listPerformanceStoresForFilter,
  sumChartRows,
} from "@/modules/operations/services/operations-metrics.service";
import { jsonWithStatsCache } from "@/lib/api-cache-headers";
import { parseApiPagination, paginateArray } from "@/lib/api-pagination";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";
import {
  aggregateCustomerMetricsForRetailIds,
  resolveRetailIdsFromPerfStores,
} from "@/modules/operations/services/operations-customer-metrics.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function shiftYear(dateStr: string, deltaYears: number): string {
  const d = parseDateOnlyUTC(dateStr);
  d.setUTCFullYear(d.getUTCFullYear() + deltaYears);
  return formatDateOnly(d);
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
        "與「圖表」相同公式；KPI 依篩選區間累計桃園區＋宜蘭區；營收成長率為去年同期同區間",
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
    const filteredStoreIds = storeId
      ? [storeId]
      : filterStores
          .filter((s) => !region || s.region === region)
          .map((s) => s.id);

    // DailyStorePerformance 關聯 RetailStore（非 Store），需先轉換 ID
    const filteredPerfStores = storeId
      ? filterStores.filter((s) => s.id === storeId)
      : filterStores.filter((s) => !region || s.region === region);

    const [perStore, priorPerStore, filteredRetailIds] = await Promise.all([
      fetchChartsPerStore(effectiveRange.startDate, effectiveRange.endDate),
      fetchPriorYearChartsForFilter(
        effectiveRange.startDate,
        effectiveRange.endDate,
        (ymd, delta) => shiftYear(ymd, delta)
      ),
      resolveRetailIdsFromPerfStores(filteredPerfStores),
    ]);

    const filteredCustomerMetrics = await aggregateCustomerMetricsForRetailIds(
      filteredRetailIds,
      effectiveRange.startDate,
      effectiveRange.endDate
    );

    const dualCurrent = sumChartRows(
      filterChartsByCatalogRegions(perStore, DUAL_OPS_REGIONS)
    );
    const priorStart = shiftYear(effectiveRange.startDate, -1);
    const priorEnd = shiftYear(effectiveRange.endDate, -1);
    const [dualPriorRevenue, dualCurrentRevenue] = await Promise.all([
      fetchDualRegionRevenueTotal(priorStart, priorEnd),
      fetchDualRegionRevenueTotal(effectiveRange.startDate, effectiveRange.endDate),
    ]);
    const kpiYoyGrowthRate = yoyGrowthRate(dualCurrentRevenue, dualPriorRevenue);

    const selectedStore = storeId
      ? filterStores.find((s) => s.id === storeId)
      : null;

    const filterLabel = selectedStore
      ? selectedStore.storeName
      : region || "全部門市";

    const filteredStoreCount = storeId
      ? 1
      : getOpsCatalogStoreCount(region || undefined);

    const skipDailyTrend = sp.get("skipDailyTrend") !== "0";
    const includeStores = sp.get("includeStores") === "1";
    const { page, pageSize } = parseApiPagination(sp, { pageSize: 50, maxPageSize: 100 });

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
      skipDailyTrend,
    });

    const storesPaged =
      includeStores ?
        paginateArray(filteredResult.stores, page, pageSize)
      : { items: [] as typeof filteredResult.stores, pagination: null };

    // 單一門市時計算現貨文扣工時與扣工時，供門市入口透明度顯示
    let contentDeductionHours: number | null = null;
    let storeDeductionHours: number | null = null;
    let rawAttendanceHours: number | null = null;
    if (storeId && selectedStore) {
      const rangeStart = parseDateOnlyUTC(effectiveRange.startDate);
      const rangeEnd = parseDateOnlyUTC(effectiveRange.endDate);
      const catalogKey = selectedStore.catalogKey;
      const branchVariants = [catalogKey, `${catalogKey}店`];
      const [contentEntries, storeDeductions] = await Promise.all([
        prisma.contentEntry.findMany({
          where: {
            workDate: { gte: rangeStart, lte: rangeEnd },
            branch: { in: branchVariants },
            deductedMinutes: { not: null, gt: 0 },
          },
          select: { deductedMinutes: true },
        }),
        prisma.storeHourDeduction.findMany({
          where: { workDate: { gte: rangeStart, lte: rangeEnd }, storeId },
          select: { hours: true },
        }),
      ]);
      contentDeductionHours = Math.round(
        contentEntries.reduce((s, e) => s + (e.deductedMinutes ?? 0) / 60, 0) * 10
      ) / 10;
      storeDeductionHours = Math.round(
        storeDeductions.reduce((s, d) => s + Number(d.hours), 0) * 10
      ) / 10;
      rawAttendanceHours = Math.round(
        (filteredResult.summary.laborHours + contentDeductionHours + storeDeductionHours) * 10
      ) / 10;
    }

    return jsonWithStatsCache({
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
        page: includeStores ? page : null,
        pageSize: includeStores ? pageSize : null,
      },
      kpiMetrics: {
        totalRevenue: dualCurrentRevenue,
        totalLaborHours: dualCurrent.laborHours,
        efficiencyRatio: dualCurrent.efficiencyRatio,
        yoyGrowthRate: kpiYoyGrowthRate,
        priorYearRevenue: dualPriorRevenue,
        regionLabel: "桃園區 + 宜蘭區",
        periodStartDate: effectiveRange.startDate,
        periodEndDate: effectiveRange.endDate,
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
        scheduledHours: filteredResult.summary.scheduledHours,
        overtimeHours: filteredResult.summary.overtimeHours,
        overtimeRatio: filteredResult.summary.overtimeRatio,
        weekdayBusinessHours: filteredResult.summary.weekdayBusinessHours,
        saturdayBusinessHours: filteredResult.summary.saturdayBusinessHours,
        dailyBusinessHours: filteredResult.summary.dailyBusinessHours,
        businessHoursLabel: filteredResult.summary.businessHoursLabel,
        defaultLaborHours: filteredResult.summary.defaultLaborHours,
        monthlyLaborHourTarget: filteredResult.summary.monthlyLaborHourTarget,
        laborHoursDifference: filteredResult.summary.overtimeHours,
        workingDaysInRange: filteredResult.workingDaysInRange,
        dailyTrend: filteredResult.dailyTrend,
        stores: storesPaged.items,
        customerCount: filteredCustomerMetrics.totalCustomerCount,
        avgOrderValue: filteredCustomerMetrics.avgOrderValue,
        customerDaysWithData: filteredCustomerMetrics.daysWithData,
        rawAttendanceHours,
        contentDeductionHours,
        storeDeductionHours,
      },
      storesPagination: storesPaged.pagination,
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
