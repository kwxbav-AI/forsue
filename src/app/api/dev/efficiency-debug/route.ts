import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatDateOnly,
  formatDateOnlyTaipei,
  parseDateOnlyUTC,
  toDateRangeTaipei,
  businessDayWorkDateFromDate,
  toStartOfDay,
} from "@/lib/date";
import {
  buildRangeDailyMetricsPrefetch,
  computeDailyMetricsByStoreWithPrefetch,
} from "@/modules/performance/services/range-daily-metrics-prefetch.service";

export const dynamic = "force-dynamic";

/**
 * 開發用：診斷某門市某日工效比計算過程
 * GET /api/dev/efficiency-debug?date=2026-05-11&storeId=<HR_STORE_ID>
 * 不提供 storeId 則只看當月營收/出勤摘要
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const date = sp.get("date")?.trim() ?? formatDateOnly(new Date());
  const storeId = sp.get("storeId")?.trim() ?? "";

  const [year, month] = date.split("-").map(Number);
  const startYmd = `${year}-${String(month).padStart(2, "0")}-01`;
  const endYmd = new Date(year, month, 0).getDate().toString().padStart(2, "0");
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${endYmd}`;
  const monthRange = toDateRangeTaipei(startYmd, monthEnd);

  // 列出所有門市方便查 storeId
  const stores = await prisma.store.findMany({
    where: { isActive: true, hideInReports: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // 月度營收/出勤摘要
  const [revMonth, attMonth, recentBatches] = await Promise.all([
    prisma.revenueRecord.groupBy({
      by: ["storeId"],
      where: { revenueDate: { gte: monthRange.start, lte: monthRange.end } },
      _sum: { revenueAmount: true },
      _count: true,
    }),
    prisma.attendanceRecord.groupBy({
      by: ["workDate"],
      where: {
        workDate: {
          gte: parseDateOnlyUTC(startYmd),
          lte: parseDateOnlyUTC(monthEnd),
        },
      },
      _count: true,
      orderBy: { workDate: "asc" },
    }),
    prisma.uploadBatch.findMany({
      orderBy: { uploadedAt: "desc" },
      take: 10,
      select: {
        fileType: true,
        originalName: true,
        recordCount: true,
        status: true,
        uploadedAt: true,
        errorMessage: true,
      },
    }),
  ]);

  const summary = {
    month: `${year}-${String(month).padStart(2, "0")}`,
    revenueStoreCount: revMonth.length,
    revenueTotalRecords: revMonth.reduce((a, r) => a + r._count, 0),
    attendanceDaysWithData: attMonth.map((r) => ({
      workDate: formatDateOnly(r.workDate),
      count: r._count,
    })),
    recentBatches: recentBatches.map((b) => ({
      fileType: b.fileType,
      originalName: b.originalName,
      recordCount: b.recordCount,
      status: b.status,
      uploadedAt: b.uploadedAt?.toISOString(),
      error: b.errorMessage ?? null,
    })),
  };

  if (!storeId) {
    return NextResponse.json({
      hint: "加上 &storeId=<HR_STORE_ID> 以診斷特定門市。可用門市如下：",
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      summary,
    });
  }

  // 以下：針對特定門市診斷 5/11（或指定日）的計算
  const workDate = parseDateOnlyUTC(date);
  const exactWorkDate = businessDayWorkDateFromDate(toStartOfDay(workDate));

  // 1. 出勤記錄（直接查 DB，不走 prefetch）
  const attRecords = await prisma.attendanceRecord.findMany({
    where: { workDate: exactWorkDate },
    select: {
      employeeId: true,
      workHours: true,
      originalStoreId: true,
      workDate: true,
      employee: { select: { name: true, defaultStoreId: true } },
    },
  });

  // 2. 出勤中屬於此門市的
  const storeAtts = attRecords.filter(
    (a) =>
      a.employee.defaultStoreId === storeId || a.originalStoreId === storeId
  );

  // 3. 派遣紀錄
  const dispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: exactWorkDate, confirmStatus: "已確認" },
    select: { employeeId: true, toStoreId: true, dispatchHours: true, actualHours: true },
  });

  // 4. 當日營收（直接查 DB）
  const revenue = await prisma.revenueRecord.findMany({
    where: {
      storeId,
      revenueDate: {
        gte: parseDateOnlyUTC(date),
        lte: new Date(parseDateOnlyUTC(date).getTime() + 86400000 - 1),
      },
    },
    select: { revenueDate: true, revenueAmount: true },
  });

  // 5. 用 prefetch 計算整月（與月曆完全相同路徑）
  let prefetchResult: { revenue: number; laborHours: number } | null = null;
  let prefetchError: string | null = null;
  try {
    const prefetch = await buildRangeDailyMetricsPrefetch(startYmd, monthEnd);
    const metrics = await computeDailyMetricsByStoreWithPrefetch(workDate, prefetch);
    const m = metrics.get(storeId);
    prefetchResult = m ? { revenue: m.revenue, laborHours: m.laborHours } : null;

    // 也顯示 prefetch 內部的 revenueByYmdStore 對應此日
    const revenueKey = formatDateOnly(toStartOfDay(workDate));
    const revMap = prefetch.revenueByYmdStore.get(revenueKey);
    const revenueInPrefetch = revMap ? (revMap.get(storeId) ?? 0) : 0;

    return NextResponse.json({
      queryDate: date,
      storeId,
      storeName: stores.find((s) => s.id === storeId)?.name ?? "不明",
      exactWorkDateISO: exactWorkDate.toISOString(),
      directQuery: {
        allAttendanceForDay: attRecords.length,
        storeAttendance: storeAtts.map((a) => ({
          name: a.employee.name,
          defaultStoreId: a.employee.defaultStoreId,
          originalStoreId: a.originalStoreId,
          workHours: Number(a.workHours),
          workDate: formatDateOnly(a.workDate),
        })),
        dispatches: dispatches
          .filter((d) => d.toStoreId === storeId)
          .map((d) => ({
            employeeId: d.employeeId,
            dispatchHours: Number(d.dispatchHours),
            actualHours: d.actualHours ? Number(d.actualHours) : null,
          })),
        revenue: revenue.map((r) => ({
          revenueDate: formatDateOnlyTaipei(r.revenueDate),
          amount: Number(r.revenueAmount),
        })),
      },
      prefetchCalc: {
        revenueKeyUsed: revenueKey,
        revenueInPrefetch,
        result: prefetchResult,
        efficiencyRatio:
          prefetchResult && prefetchResult.laborHours > 0
            ? Math.round(prefetchResult.revenue / prefetchResult.laborHours)
            : null,
      },
      summary,
    });
  } catch (e) {
    prefetchError = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ queryDate: date, storeId, prefetchError, summary }, { status: 500 });
  }
}
