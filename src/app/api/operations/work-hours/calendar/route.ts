import { NextRequest, NextResponse } from "next/server";
import { buildWorkHoursCalendar } from "@/modules/operations/services/operations-work-hours.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const storeId = sp.get("storeId")?.trim();
    const year = Number(sp.get("year")?.trim());
    const month = Number(sp.get("month")?.trim());

    if (!storeId) {
      return NextResponse.json({ error: "請提供 storeId" }, { status: 400 });
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "請提供有效 year" }, { status: 400 });
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "請提供有效 month (1-12)" }, { status: 400 });
    }

    const data = await buildWorkHoursCalendar({ storeId, year, month });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/operations/work-hours/calendar failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
