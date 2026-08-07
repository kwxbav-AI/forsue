import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";
import {
  parseDateOnlyUTC,
  formatDateOnly,
  businessDayWorkDateFromDate,
  toStartOfDay,
} from "@/lib/date";

function extractDispatchReason(remark: string | null): string {
  if (!remark) return "";
  const s = remark.trim();
  if (!s) return "";
  return s.split("/")[0].trim();
}

export const dynamic = "force-dynamic";

/**
 * 診斷指定日期工時計算為何歸零
 * GET /api/dev/workhours-debug?date=2026-08-03
 * 需要登入（任何有效 session 均可）
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const dateStr = sp.get("date")?.trim() ?? formatDateOnly(new Date());

  const workDate = parseDateOnlyUTC(dateStr);
  const exactWorkDate = businessDayWorkDateFromDate(toStartOfDay(workDate));

  const [attendances, dispatches, adjustments] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { workDate: exactWorkDate },
      select: {
        employeeId: true,
        workHours: true,
        originalStoreId: true,
        employee: { select: { name: true, defaultStoreId: true, employeeCode: true } },
      },
    }),
    prisma.dispatchRecord.findMany({
      where: { workDate: exactWorkDate, confirmStatus: "已確認" },
      select: {
        employeeId: true,
        fromStoreId: true,
        toStoreId: true,
        dispatchHours: true,
        actualHours: true,
        remark: true,
        employee: { select: { name: true } },
      },
    }),
    prisma.workhourAdjustment.findMany({
      where: { workDate: exactWorkDate },
      select: {
        employeeId: true,
        storeId: true,
        adjustmentHours: true,
        employee: { select: { name: true } },
      },
    }),
  ]);

  // 模擬 computeStoreHoursByEmployee 的 aggregation
  const aggregated = new Map<string, { name: string; origStoreId: string | null; workHours: number }>();
  for (const a of attendances) {
    const prev = aggregated.get(a.employeeId);
    aggregated.set(a.employeeId, {
      name: a.employee.name ?? a.employeeId,
      origStoreId: prev?.origStoreId ?? a.originalStoreId ?? null,
      workHours: (prev?.workHours ?? 0) + Number(a.workHours),
    });
  }

  // 模擬 employeeStores
  const employeeStores = new Map<string, Record<string, number>>();
  for (const [empId, att] of aggregated.entries()) {
    const storeId = att.origStoreId ?? "unknown";
    employeeStores.set(empId, { [storeId]: att.workHours });
  }

  // 找出會觸發 warn 的調度
  const dispatchWarnings: object[] = [];
  for (const disp of dispatches) {
    const fromStoreId =
      disp.fromStoreId ||
      aggregated.get(disp.employeeId)?.origStoreId ||
      null;
    const storeHours = employeeStores.get(disp.employeeId);
    const fromStoreIdResolved = fromStoreId || (storeHours ? Object.keys(storeHours)[0] : null);
    const dispatchH =
      disp.actualHours != null ? Number(disp.actualHours) : Number(disp.dispatchHours);
    const reason = extractDispatchReason(disp.remark ?? null);
    const isBackoffice = reason === "後勤支援門市";

    if (isBackoffice && disp.actualHours == null) {
      dispatchWarnings.push({
        type: "後勤支援門市未填實際工時",
        employee: disp.employee.name,
        employeeId: disp.employeeId,
        toStoreId: disp.toStoreId,
        remark: disp.remark,
      });
    } else if (fromStoreIdResolved) {
      const fromCurrent = storeHours?.[fromStoreIdResolved] ?? 0;
      if (fromCurrent < dispatchH) {
        dispatchWarnings.push({
          type: "調度工時大於出勤工時",
          employee: disp.employee.name,
          employeeId: disp.employeeId,
          fromStoreId: fromStoreIdResolved,
          attendanceHours: fromCurrent,
          dispatchHours: dispatchH,
        });
      }
    }
  }

  // 找出會觸發 warn 的工時調整
  const adjustmentWarnings: object[] = [];
  for (const adj of adjustments) {
    const storeId = adj.storeId || (employeeStores.get(adj.employeeId) ? Object.keys(employeeStores.get(adj.employeeId)!)[0] : null);
    if (!storeId) continue;
    const current = employeeStores.get(adj.employeeId)?.[storeId] ?? 0;
    const after = current + Number(adj.adjustmentHours);
    if (after < 0) {
      adjustmentWarnings.push({
        type: "調整後工時小於0",
        employee: adj.employee.name,
        employeeId: adj.employeeId,
        storeId,
        currentHours: current,
        adjustmentHours: Number(adj.adjustmentHours),
        resultHours: after,
      });
    }
  }

  return NextResponse.json({
    date: dateStr,
    exactWorkDateISO: exactWorkDate.toISOString(),
    attendanceCount: attendances.length,
    dispatchCount: dispatches.length,
    adjustmentCount: adjustments.length,
    dispatchWarnings,
    adjustmentWarnings,
    wouldHaveCausedZeroHours: dispatchWarnings.length > 0 || adjustmentWarnings.length > 0,
  });
}
