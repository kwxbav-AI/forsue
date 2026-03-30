import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay } from "@/lib/date";
import { computeStoreHoursByEmployee } from "@/modules/performance/services/attendance-allocation.service";

export const dynamic = "force-dynamic";

/** 單一員工單日總上班時數與當天上傳門市（含調度與工時異動後） */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const employeeId = searchParams.get("employeeId");
  if (!date || !employeeId) {
    return NextResponse.json(
      { error: "請提供 date 與 employeeId" },
      { status: 400 }
    );
  }
  const workDate = toStartOfDay(date);
  const byEmployee = await computeStoreHoursByEmployee(workDate);
  const storeHours = byEmployee.get(employeeId);
  const workHours = storeHours
    ? Object.values(storeHours).reduce((a, b) => a + b, 0)
    : 0;

  const attendance = await prisma.attendanceRecord.findFirst({
    where: { workDate, employeeId },
    include: { employee: { select: { defaultStoreId: true } } },
  });
  let storeId =
    attendance?.originalStoreId ?? attendance?.employee?.defaultStoreId ?? null;

  // 若出勤表有部門，優先用「門市管理.department」對應門市
  const dept = (attendance?.department || "").trim();
  if (dept) {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, department: true, name: true },
    });
    const match =
      stores.find((s) => (s.department || "").trim() === dept) ??
      stores.find((s) => (s.name || "").trim() === dept);
    if (match) storeId = match.id;
  }

  return NextResponse.json({
    date,
    employeeId,
    workHours,
    storeId,
    department: dept || null,
    startTime: attendance?.startTime ?? null,
    endTime: attendance?.endTime ?? null,
  });
}
