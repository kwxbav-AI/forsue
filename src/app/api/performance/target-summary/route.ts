import { NextRequest, NextResponse } from "next/server";
import { jsonWithStatsCache } from "@/lib/api-cache-headers";
import { buildTargetSummaryReport } from "@/modules/performance/services/target-summary.service";

export const dynamic = "force-dynamic";

/** 達標次數統計：日期區間內各門市達標天數、未達標天數、達標率、平均工效比 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const storeId = searchParams.get("storeId")?.trim() || undefined;

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "請提供 startDate 與 endDate (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const result = await buildTargetSummaryReport({
    startDate,
    endDate,
    storeId,
  });

  return jsonWithStatsCache(result);
}
