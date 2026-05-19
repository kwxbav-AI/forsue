import { NextRequest, NextResponse } from "next/server";
import { formatDateOnlyTaipei } from "@/lib/date";
import { OPS_REGION_CATALOG } from "@/lib/operations-dashboard";
import {
  efficiencyTargetForYmd,
  storeEfficiencyStatus,
  EFFICIENCY_STATUS_LABEL,
} from "@/lib/operations-efficiency";
import {
  fetchChartsPerStore,
  listPerformanceStoresForFilter,
} from "@/modules/operations/services/operations-metrics.service";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const startDate = sp.get("startDate")?.trim();
    const endDate = sp.get("endDate")?.trim() || formatDateOnlyTaipei();
    const region = sp.get("region")?.trim() || "";

    if (!startDate) {
      return NextResponse.json({ error: "請提供 startDate" }, { status: 400 });
    }

    const effective = await resolveEffectiveMetricsDateRange(startDate, endDate);
    const [chartRows, filterStores] = await Promise.all([
      fetchChartsPerStore(effective.startDate, effective.endDate),
      listPerformanceStoresForFilter(),
    ]);

    const chartByStoreId = new Map(chartRows.map((r) => [r.storeId, r]));

    const stores = filterStores
      .filter((s) => !region || s.region === region)
      .map((meta) => {
        const chart = chartByStoreId.get(meta.id);
        const revenue = chart?.revenueSum ?? 0;
        const laborHours = chart?.hoursSum ?? 0;
        const efficiencyRatio = chart?.efficiencyRatio ?? null;
        const hasActivity = revenue > 0 || laborHours > 0;
        const status = storeEfficiencyStatus(
          effective.endDate,
          efficiencyRatio,
          hasActivity
        );
        const effTarget = efficiencyTargetForYmd(effective.endDate);
        const achievementPct =
          efficiencyRatio != null && laborHours > 0 ?
            Math.min(150, Math.round((efficiencyRatio / effTarget) * 100))
          : null;

        return {
          storeId: meta.id,
          storeName: meta.storeName,
          catalogKey: meta.catalogKey,
          region: meta.region,
          revenue,
          laborHours,
          efficiencyRatio,
          status,
          statusLabel: EFFICIENCY_STATUS_LABEL[status],
          achievementPct,
        };
      });

    const regionStats = OPS_REGION_CATALOG.map((g) => {
      const inRegion = stores.filter((s) => s.region === g.region);
      const revenue = inRegion.reduce((a, s) => a + s.revenue, 0);
      const laborHours = inRegion.reduce((a, s) => a + s.laborHours, 0);
      const green = inRegion.filter((s) => s.status === "green").length;
      const yellow = inRegion.filter((s) => s.status === "yellow").length;
      const red = inRegion.filter((s) => s.status === "red").length;
      const withData = inRegion.filter((s) => s.status !== "none").length;
      const achievementRate =
        withData > 0 ? Math.round((green / withData) * 1000) / 10 : null;
      return {
        region: g.region,
        storeCount: inRegion.length,
        revenue,
        laborHours,
        efficiencyRatio: laborHours > 0 ? revenue / laborHours : null,
        green,
        yellow,
        red,
        achievementRate,
      };
    }).filter((r) => !region || r.region === region);

    const green = stores.filter((s) => s.status === "green").length;
    const yellow = stores.filter((s) => s.status === "yellow").length;
    const red = stores.filter((s) => s.status === "red").length;
    const totalRevenue = stores.reduce((a, s) => a + s.revenue, 0);
    const totalLaborHours = stores.reduce((a, s) => a + s.laborHours, 0);

    return NextResponse.json({
      startDate: effective.startDate,
      endDate: effective.endDate,
      region: region || null,
      summary: {
        storeCount: stores.length,
        totalRevenue,
        totalLaborHours,
        efficiencyRatio: totalLaborHours > 0 ? totalRevenue / totalLaborHours : null,
        green,
        yellow,
        red,
        achievementRate:
          stores.length > 0 ? Math.round((green / stores.length) * 1000) / 10 : null,
      },
      regionStats,
      stores: stores.sort((a, b) => (b.efficiencyRatio ?? 0) - (a.efficiencyRatio ?? 0)),
    });
  } catch (error) {
    console.error("GET /api/operations/overview failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
