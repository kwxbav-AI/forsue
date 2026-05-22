import { NextRequest, NextResponse } from "next/server";
import {
  listDailyPerformanceRows,
  listSingleDayPerformanceRows,
} from "@/modules/performance/services/daily-performance-list.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date")?.trim();
  const startDate = searchParams.get("startDate")?.trim();
  const endDate = searchParams.get("endDate")?.trim();
  const region = searchParams.get("region")?.trim() || "";
  const storeId = searchParams.get("storeId")?.trim() || "";

  try {
    if (startDate && endDate) {
      if (startDate > endDate) {
        return NextResponse.json({ error: "開始日不可晚於結束日" }, { status: 400 });
      }
      const result = await listDailyPerformanceRows({
        startYmd: startDate,
        endYmd: endDate,
        region: region || undefined,
        storeId: storeId || undefined,
      });
      return NextResponse.json(result);
    }

    if (!date) {
      return NextResponse.json(
        { error: "請提供 date 或 startDate + endDate (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const list = await listSingleDayPerformanceRows(
      date,
      region || undefined,
      storeId || undefined
    );
    return NextResponse.json(list);
  } catch (error) {
    console.error("GET /api/performance/daily failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
