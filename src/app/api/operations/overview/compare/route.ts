/**
 * 臨時診斷端點：比對引擎計算 vs 簡化直接查詢的工時差距
 * 使用完畢後可刪除此檔案
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toDateRange, formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { fetchChartsPerStore } from "@/modules/operations/services/operations-metrics.service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const startYmd = sp.get("startDate") || "2026-07-01";
  const endYmd   = sp.get("endDate")   || "2026-07-31";

  const rangeStart = parseDateOnlyUTC(startYmd);
  const rangeEnd   = parseDateOnlyUTC(endYmd);
  const { start: revenueStart, end: revenueEnd } = toDateRange(startYmd, endYmd);

  // ── 方案 A：引擎計算（現有邏輯）────────────────────────────
  const engineRows = await fetchChartsPerStore(startYmd, endYmd);
  const engineByStore = new Map(engineRows.map((r) => [r.storeId, r]));

  // ── 方案 B：簡化直接查詢 ────────────────────────────────────
  const [attRows, dispatches, adjustments, revenueRows, stores] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
      select: {
        employeeId: true,
        workDate: true,
        workHours: true,
        originalStoreId: true,
        employee: { select: { defaultStoreId: true, isReserveStaff: true, hireDate: true, employeeCode: true } },
      },
    }),
    prisma.dispatchRecord.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd }, confirmStatus: "已確認" },
      select: { employeeId: true, workDate: true, toStoreId: true },
    }),
    prisma.workhourAdjustment.findMany({
      where: { workDate: { gte: rangeStart, lte: rangeEnd } },
      select: { storeId: true, adjustmentHours: true },
    }),
    prisma.revenueRecord.groupBy({
      by: ["storeId"],
      where: { revenueDate: { gte: revenueStart, lte: revenueEnd } },
      _sum: { revenueAmount: true },
    }),
    prisma.store.findMany({
      where: { isActive: true, hideInReports: false },
      select: { id: true, name: true },
    }),
  ]);

  // 調派 Map：(employeeId|workDateMs) → toStoreId
  const dispatchMap = new Map<string, string>();
  for (const d of dispatches) {
    dispatchMap.set(`${d.employeeId}|${d.workDate.getTime()}`, d.toStoreId);
  }

  // 計算簡化版工時（不含新人折算、備勤分配）
  const simpleHoursMap = new Map<string, number>();
  const newHireAffected: { name: string; code: string; hours: number }[] = [];
  const reserveAffected: { code: string; hours: number }[] = [];

  for (const a of attRows) {
    const hrs = Number(a.workHours ?? 0);
    if (hrs <= 0) continue;

    const key = `${a.employeeId}|${a.workDate.getTime()}`;
    const storeId = dispatchMap.get(key) ?? a.originalStoreId ?? a.employee?.defaultStoreId;
    if (!storeId) continue;

    simpleHoursMap.set(storeId, (simpleHoursMap.get(storeId) ?? 0) + hrs);

    // 記錄可能有影響的員工
    if (a.employee?.isReserveStaff) {
      const code = a.employee ? String((a.employee as any).employeeCode ?? "") : "";
      reserveAffected.push({ code, hours: hrs });
    }
    if (a.employee?.hireDate) {
      const monthsIn = Math.floor(
        (new Date(startYmd).getTime() - new Date(a.employee.hireDate).getTime()) /
        (30.5 * 24 * 3600 * 1000)
      );
      if (monthsIn < 12) {
        const code = String((a.employee as any).employeeCode ?? "");
        newHireAffected.push({ name: String((a.employee as any).name ?? ""), code, hours: hrs });
      }
    }
  }

  for (const adj of adjustments) {
    if (!adj.storeId) continue;
    simpleHoursMap.set(adj.storeId, (simpleHoursMap.get(adj.storeId) ?? 0) + Number(adj.adjustmentHours ?? 0));
  }

  const revenueByStore = new Map(
    revenueRows.map((r) => [r.storeId, Number(r._sum.revenueAmount ?? 0)])
  );

  // ── 比對 ────────────────────────────────────────────────────
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const comparison = [];

  const allStoreIds = new Set([
    ...engineByStore.keys(),
    ...simpleHoursMap.keys(),
    ...revenueByStore.keys(),
  ]);

  for (const storeId of allStoreIds) {
    const engineRow  = engineByStore.get(storeId);
    const simpleHrs  = Math.round((simpleHoursMap.get(storeId) ?? 0) * 10) / 10;
    const engineHrs  = Math.round((engineRow?.hoursSum ?? 0) * 10) / 10;
    const engineRev  = Math.round(engineRow?.revenueSum ?? 0);
    const simpleRev  = Math.round(revenueByStore.get(storeId) ?? 0);
    const hrsDiff    = Math.round((simpleHrs - engineHrs) * 10) / 10;
    const effEngine  = engineHrs > 0 ? Math.round(engineRev / engineHrs) : null;
    const effSimple  = simpleHrs > 0 ? Math.round(simpleRev / simpleHrs) : null;

    if (engineHrs === 0 && simpleHrs === 0) continue;

    comparison.push({
      storeName:  storeNameById.get(storeId) ?? storeId.slice(0, 8),
      engineHrs,
      simpleHrs,
      hrsDiff,
      hrsDiffPct: engineHrs > 0 ? Math.round((hrsDiff / engineHrs) * 1000) / 10 : null,
      engineRev,
      simpleRev,
      revDiff:    simpleRev - engineRev,
      effEngine,
      effSimple,
      effDiff:    effEngine != null && effSimple != null ? effSimple - effEngine : null,
    });
  }

  comparison.sort((a, b) => Math.abs(b.hrsDiff) - Math.abs(a.hrsDiff));

  const totalEngineHrs  = comparison.reduce((s, r) => s + r.engineHrs, 0);
  const totalSimpleHrs  = comparison.reduce((s, r) => s + r.simpleHrs, 0);
  const totalEngineRev  = comparison.reduce((s, r) => s + r.engineRev, 0);

  return NextResponse.json({
    range: { startYmd, endYmd },
    summary: {
      totalEngineHrs:  Math.round(totalEngineHrs * 10) / 10,
      totalSimpleHrs:  Math.round(totalSimpleHrs * 10) / 10,
      totalHrsDiff:    Math.round((totalSimpleHrs - totalEngineHrs) * 10) / 10,
      totalHrsDiffPct: totalEngineHrs > 0
        ? Math.round(((totalSimpleHrs - totalEngineHrs) / totalEngineHrs) * 1000) / 10
        : null,
      totalRevenue:    totalEngineRev,
      effEngine:       totalEngineHrs > 0 ? Math.round(totalEngineRev / totalEngineHrs) : null,
      effSimple:       totalSimpleHrs > 0 ? Math.round(totalEngineRev / totalSimpleHrs) : null,
    },
    byStore: comparison,
    potentialImpact: {
      newHireCount:   [...new Set(newHireAffected.map((e) => e.code))].length,
      reserveCount:   [...new Set(reserveAffected.map((e) => e.code))].length,
    },
  });
}
