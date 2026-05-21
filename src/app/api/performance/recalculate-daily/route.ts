import { NextRequest, NextResponse } from "next/server";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";
import { toStartOfDay } from "@/lib/date";

export const dynamic = "force-dynamic";

function queueRecalculateDateRange(startDate: string, endDate: string): void {
  void (async () => {
    try {
      const start = toStartOfDay(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      await performanceEngineService.recalculateDateRange(start, end);
      console.info(
        `[recalculate-daily] completed ${startDate} ~ ${endDate}`
      );
    } catch (e) {
      console.error(
        `[recalculate-daily] failed ${startDate} ~ ${endDate}`,
        e
      );
    }
  })();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const date = body.date as string | undefined;
    if (date) {
      const d = toStartOfDay(date);
      await performanceEngineService.recalculateDailyPerformance(d);
      return NextResponse.json({ success: true, date });
    }

    const startDate = body.startDate as string | undefined;
    const endDate = body.endDate as string | undefined;
    if (startDate && endDate) {
      queueRecalculateDateRange(startDate, endDate);
      return NextResponse.json(
        {
          status: "queued",
          success: true,
          startDate,
          endDate,
          message: "已排入背景重算，請稍後再查詢績效資料",
        },
        { status: 202 }
      );
    }

    return NextResponse.json(
      { error: "請提供 date 或 startDate+endDate" },
      { status: 400 }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "重算失敗" },
      { status: 500 }
    );
  }
}
