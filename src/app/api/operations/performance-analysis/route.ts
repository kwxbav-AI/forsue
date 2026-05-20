import { NextRequest, NextResponse } from "next/server";
import { currentMonthRangeTaipei } from "@/lib/operations-default-dates";
import { buildPerformanceAnalysis } from "@/modules/operations/services/operations-performance-analysis.service";
import { resolveEffectiveMetricsDateRange } from "@/modules/performance/services/performance-daily-range.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const defaults = currentMonthRangeTaipei();
    const startDate = sp.get("startDate")?.trim() || defaults.startDate;
    const endDate = sp.get("endDate")?.trim() || defaults.endDate;
    const region = sp.get("region")?.trim() || undefined;
    const storeId = sp.get("storeId")?.trim() || undefined;

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "開始日不可晚於結束日" },
        { status: 400 }
      );
    }

    const effective = await resolveEffectiveMetricsDateRange(startDate, endDate);

    const data = await buildPerformanceAnalysis({
      startYmd: effective.startDate,
      endYmd: effective.endDate,
      storeId,
      region,
    });

    return NextResponse.json({
      ...data,
      startDate: effective.startDate,
      endDate: effective.endDate,
    });
  } catch (error) {
    console.error("GET /api/operations/performance-analysis failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
