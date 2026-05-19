import { NextRequest, NextResponse } from "next/server";
import { buildPerformanceAnalysis } from "@/modules/operations/services/operations-performance-analysis.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const monthsRaw = sp.get("months")?.trim() || "6";
    const months = Number(monthsRaw);
    if (![3, 6, 12].includes(months)) {
      return NextResponse.json(
        { error: "months 須為 3、6 或 12" },
        { status: 400 }
      );
    }
    const storeId = sp.get("storeId")?.trim() || undefined;

    const data = await buildPerformanceAnalysis({
      months: months as 3 | 6 | 12,
      storeId,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/operations/performance-analysis failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
