import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay, formatDateOnly } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "請提供 date (YYYY-MM-DD)" }, { status: 400 });
  }
  const workDate = toStartOfDay(date);
  const list = await prisma.performanceDaily.findMany({
    where: {
      workDate,
      versionNo: 1,
      store: {
        isActive: true,
        hideInReports: false as any,
      },
    },
    include: { store: true },
    orderBy: { store: { name: "asc" } },
  });
  return NextResponse.json(
    list.map((p) => ({
      id: p.id,
      workDate: formatDateOnly(p.workDate),
      storeId: p.storeId,
      storeName: p.store.name,
      storeCode: p.store.code,
      revenueAmount: Number(p.revenueAmount),
      totalWorkHours: Number(p.totalWorkHours),
      efficiencyRatio: Number(p.efficiencyRatio),
      targetValue: Number(p.targetValue),
      isTargetMet: p.isTargetMet,
      calculatedAt: p.calculatedAt.toISOString(),
    }))
  );
}
