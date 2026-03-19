import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay, formatDateOnly, parseDateOnlyUTC, endOfDayUTC } from "@/lib/date";
import { computeTotalWorkHoursByStore } from "@/modules/performance/services/attendance-allocation.service";

export const dynamic = "force-dynamic";

/**
 * GET /api/performance/debug-deduction?date=2026-02-13
 * 回傳當日內容篇數扣工時與各門市總工時，用來確認扣工時是否有從總工時扣除。
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const dateStr = url.searchParams.get("date");
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: "請提供 date 參數，格式 yyyy-MM-dd" },
        { status: 400 }
      );
    }
    const d = toStartOfDay(dateStr);
    const dayStart = parseDateOnlyUTC(dateStr);
    const dayEnd = endOfDayUTC(dateStr);

    const [contentEntries, stores, storeHours, performanceDaily] = await Promise.all([
      prisma.contentEntry.findMany({
        where: { workDate: { gte: dayStart, lte: dayEnd } },
        select: { id: true, branch: true, deductedMinutes: true },
      }),
      prisma.store.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      computeTotalWorkHoursByStore(d),
      prisma.performanceDaily.findMany({
        where: { workDate: d, versionNo: 1 },
        select: { storeId: true, totalWorkHours: true },
      }),
    ]);

    const nameToStore = new Map(stores.map((s) => [s.name.trim(), s.id]));
    const contentDeductionHoursByStore: Record<string, number> = {};
    for (const entry of contentEntries) {
      const key = entry.branch.trim();
      if (!key) continue;
      const storeId = nameToStore.get(key);
      if (!storeId || entry.deductedMinutes == null) continue;
      contentDeductionHoursByStore[storeId] =
        (contentDeductionHoursByStore[storeId] ?? 0) + entry.deductedMinutes / 60;
    }

    const storeIdToName = new Map(stores.map((s) => [s.id, s.name]));
    const perfByStore = new Map(performanceDaily.map((p) => [p.storeId, p.totalWorkHours]));

    const perStore = stores.map((store) => {
      const rawHours = storeHours[store.id] ?? 0;
      const deductionHours = contentDeductionHoursByStore[store.id] ?? 0;
      const expectedTotal = Math.max(0, rawHours - deductionHours);
      const actualTotalDecimal = perfByStore.get(store.id) ?? null;
      const actualTotal = actualTotalDecimal != null ? Number(actualTotalDecimal) : null;
      return {
        storeId: store.id,
        storeName: store.name,
        rawHours: Math.round(rawHours * 100) / 100,
        deductionHours: Math.round(deductionHours * 100) / 100,
        expectedTotalHours: Math.round(expectedTotal * 100) / 100,
        actualTotalHours: actualTotal != null ? Math.round(actualTotal * 100) / 100 : null,
        match: actualTotal != null && Math.abs(actualTotal - expectedTotal) < 0.01,
      };
    });

    return NextResponse.json({
      date: dateStr,
      contentEntries: contentEntries.map((e) => ({
        branch: e.branch,
        deductedMinutes: e.deductedMinutes,
        deductedHours: e.deductedMinutes != null ? Math.round((e.deductedMinutes / 60) * 100) / 100 : null,
      })),
      contentDeductionHoursByStore: Object.fromEntries(
        Object.entries(contentDeductionHoursByStore).map(([id, h]) => [
          id,
          { storeName: storeIdToName.get(id) ?? id, hours: Math.round(h * 100) / 100 },
        ])
      ),
      perStore,
    });
  } catch (e) {
    console.error("GET /api/performance/debug-deduction failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查詢失敗" },
      { status: 500 }
    );
  }
}
