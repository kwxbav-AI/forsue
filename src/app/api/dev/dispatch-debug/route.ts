import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC, formatDateOnlyTaipei } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * 調度調出除錯端點
 * GET /api/dev/dispatch-debug?storeId=xxx&startDate=2026-06-09&endDate=2026-06-11
 * 查詢指定門市調出記錄，協助診斷行事曆「支援X店」未顯示問題
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const startDate = searchParams.get("startDate") ?? "2026-06-09";
  const endDate = searchParams.get("endDate") ?? "2026-06-11";

  // 列出所有 HR stores（方便查找正確的 storeId）
  const allStores = await prisma.store.findMany({
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const workDates = [];
  let d = startDate;
  while (d <= endDate) {
    workDates.push(parseDateOnlyUTC(d));
    const dt = new Date(d);
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = dt.toISOString().slice(0, 10);
  }

  if (!storeId) {
    return NextResponse.json({ stores: allStores, hint: "Pass ?storeId=<id>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD" });
  }

  const targetStore = allStores.find((s) => s.id === storeId);

  // 查所有在這個日期範圍的調度記錄（不加門市過濾，看全部）
  const allDispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: { in: workDates } },
    select: {
      id: true,
      workDate: true,
      employeeId: true,
      fromStoreId: true,
      toStoreId: true,
      confirmStatus: true,
      employee: { select: { id: true, name: true, defaultStoreId: true } },
    },
    orderBy: { workDate: "asc" },
  });

  // 套用調出查詢（複製 service 的 OR 邏輯）
  const outgoingDispatches = allDispatches.filter(
    (d) =>
      d.toStoreId !== storeId &&
      (d.fromStoreId === storeId || d.employee.defaultStoreId === storeId)
  );

  // 查詢目標門市名稱
  const toStoreIds = [...new Set(outgoingDispatches.map((d) => d.toStoreId))];
  const toStores = toStoreIds.length > 0
    ? await prisma.store.findMany({ where: { id: { in: toStoreIds } }, select: { id: true, name: true } })
    : [];
  const toStoreNameById = new Map(toStores.map((s) => [s.id, s.name]));

  return NextResponse.json({
    query: { storeId, storeName: targetStore?.name ?? "（找不到）", startDate, endDate },
    allDispatches: allDispatches.map((d) => ({
      id: d.id,
      workDate: formatDateOnlyTaipei(d.workDate),
      employeeName: d.employee.name,
      employeeId: d.employeeId,
      fromStoreId: d.fromStoreId,
      fromStoreMatch: d.fromStoreId === storeId,
      defaultStoreId: d.employee.defaultStoreId,
      defaultStoreMatch: d.employee.defaultStoreId === storeId,
      toStoreId: d.toStoreId,
      toStoreName: toStoreNameById.get(d.toStoreId) ?? allStores.find((s) => s.id === d.toStoreId)?.name ?? d.toStoreId,
      confirmStatus: d.confirmStatus,
      wouldBeIncluded: d.toStoreId !== storeId && (d.fromStoreId === storeId || d.employee.defaultStoreId === storeId),
    })),
    outgoingMatchCount: outgoingDispatches.length,
    stores: allStores,
  });
}
