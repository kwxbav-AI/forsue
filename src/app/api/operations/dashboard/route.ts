import { NextRequest, NextResponse } from "next/server";
import { parseDateOnlyUTC, formatDateOnly } from "@/lib/date";
import { DUAL_OPS_REGIONS, OPS_FILTER_REGIONS } from "@/lib/operations-dashboard";
import {
  buildStoreRegionMap,
  fetchChartsPerStore,
  fetchDualRegionTotalsFromPerformanceDaily,
  filterChartsByDualRegions,
  filterChartsByOpsCatalog,
  filterChartsBySelection,
  getOpsCatalogStoreCount,
  listPerformanceStoresForFilter,
  metricsFromChartRows,
  sumChartRows,
} from "@/modules/operations/services/operations-metrics.service";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

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
      "與「每日工效比」相同公式；區間自 2026-04-01（上傳起算日）起計",
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
    const perStore = await fetchChartsPerStore(
      effectiveRange.startDate,
      effectiveRange.endDate
    );

    const allStoreIds = perStore.map((r) => r.storeId);
    const regionMap = await buildStoreRegionMap(allStoreIds);

    const dualCurrentRows = filterChartsByDualRegions(perStore, regionMap);
    const dualCurrent = sumChartRows(dualCurrentRows);

    const dualPrior = await fetchDualRegionTotalsFromPerformanceDaily(
      shiftYear(effectiveRange.startDate, -1),
      shiftYear(effectiveRange.endDate, -1)
    );

    let kpiYoyGrowthRate: number | null = null;
    if (dualPrior.revenue > 0) {
      kpiYoyGrowthRate =
        ((dualCurrent.revenue - dualPrior.revenue) / dualPrior.revenue) * 100;
    }

    const selectedStore = storeId
      ? filterStores.find((s) => s.id === storeId)
      : null;

    let filteredRows = filterChartsBySelection(perStore, regionMap, {
      storeId: storeId || undefined,
      region: storeId ? undefined : region || undefined,
      storeLabel: selectedStore?.storeName,
      catalogKey: selectedStore?.catalogKey,
    });

    if (!storeId && !region) {
      filteredRows = filterChartsByOpsCatalog(filteredRows);
    }

    const filteredCurrent = metricsFromChartRows(filteredRows);

    const filterLabel = selectedStore
      ? selectedStore.storeName
      : region || "全部門市";

    const filteredStoreCount = storeId
      ? 1
      : getOpsCatalogStoreCount(region || undefined);

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
      },
      filteredMetrics: {
        totalRevenue: filteredCurrent.revenue,
        totalLaborHours: filteredCurrent.laborHours,
        efficiencyRatio: filteredCurrent.efficiencyRatio,
        filterLabel,
        storeCount: filteredStoreCount,
        matchedStoreCount: filteredRows.length,
        hasData:
          filteredCurrent.revenue > 0 || filteredCurrent.laborHours > 0,
      },
    });
  } catch (error) {
    console.error("GET /api/operations/dashboard failed", error);
    return NextResponse.json(
      { error: "查詢失敗，請縮短日期區間或稍後再試" },
      { status: 500 }
    );
  }
}
