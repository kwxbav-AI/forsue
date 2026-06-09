import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const yearMonth = searchParams.get("yearMonth");

  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ error: "請提供 yearMonth (YYYY-MM)" }, { status: 400 });
  }

  const results = await prisma.monthlyBonusResult.findMany({
    where: { yearMonth },
    include: { dailyDetails: { orderBy: { workDate: "asc" } } },
    orderBy: [{ storeName: "asc" }, { employeeName: "asc" }],
  });

  const calculatedAt = results[0]?.calculatedAt ?? null;

  return NextResponse.json({ yearMonth, calculatedAt, results });
}
