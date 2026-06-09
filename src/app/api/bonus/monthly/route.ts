import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearMonth = searchParams.get("yearMonth");

  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: "請提供 yearMonth (YYYY-MM)" }, { status: 400 });
  }

  const raw = await prisma.monthlyBonusResult.findMany({
    where: { yearMonth },
    include: { dailyDetails: { orderBy: { workDate: "asc" } } },
    orderBy: [{ storeName: "asc" }, { employeeName: "asc" }],
  });

  const results = raw.map((r) => ({
    ...r,
    totalCalcHours: Number(r.totalCalcHours),
    targetBonus: Number(r.targetBonus),
    operationsBonus: Number(r.operationsBonus),
    subtotalBonus: Number(r.subtotalBonus),
    newHireRatio: Number(r.newHireRatio),
    guaranteeAmount: r.guaranteeAmount != null ? Number(r.guaranteeAmount) : null,
    bonusMultiplier: Number(r.bonusMultiplier),
    accountabilityRatio: Number(r.accountabilityRatio),
    finalBonus: Number(r.finalBonus),
    dailyDetails: r.dailyDetails.map((d) => ({
      ...d,
      workDate: d.workDate instanceof Date ? d.workDate.toISOString().slice(0, 10) : String(d.workDate),
      efficiencyRatio: Number(d.efficiencyRatio),
      scheduledHours: Number(d.scheduledHours),
      actualWorkHours: Number(d.actualWorkHours),
      calcHours: Number(d.calcHours),
      baseBonus: Number(d.baseBonus),
      dailyBonus: Number(d.dailyBonus),
    })),
  }));

  const calculatedAt = raw[0]?.calculatedAt ?? null;

  return NextResponse.json({ yearMonth, calculatedAt, results });
}
