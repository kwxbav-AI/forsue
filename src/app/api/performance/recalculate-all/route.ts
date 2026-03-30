import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { performanceEngineService } from "@/modules/performance/services/performance-engine.service";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const dates = await prisma.performanceDaily.findMany({
      distinct: ["workDate"],
      select: { workDate: true },
      orderBy: { workDate: "asc" },
    });

    for (const d of dates) {
      await performanceEngineService.recalculateDailyPerformance(d.workDate);
    }

    return NextResponse.json({ success: true, datesCount: dates.length });
  } catch (e) {
    console.error("POST /api/performance/recalculate-all failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "重算失敗" },
      { status: 500 }
    );
  }
}

