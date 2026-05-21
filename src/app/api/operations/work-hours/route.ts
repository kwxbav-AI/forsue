import { NextRequest, NextResponse } from "next/server";
import { buildOperationsWorkHours } from "@/modules/operations/services/operations-work-hours.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const year = Number(sp.get("year")?.trim());
    const month = Number(sp.get("month")?.trim());
    const storeId = sp.get("storeId")?.trim() || undefined;

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "請提供有效 year" }, { status: 400 });
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "請提供有效 month (1-12)" }, { status: 400 });
    }

    const data = await buildOperationsWorkHours({ year, month, storeId });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/operations/work-hours failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
