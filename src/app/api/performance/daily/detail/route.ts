import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStartOfDay } from "@/lib/date";
import { computeStoreHoursByEmployee } from "@/modules/performance/services/attendance-allocation.service";

/** 單一門市單日明細：各員工在該門市的工時 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const storeId = searchParams.get("storeId");
  if (!date || !storeId) {
    return NextResponse.json(
      { error: "請提供 date 與 storeId" },
      { status: 400 }
    );
  }
  const workDate = toStartOfDay(date);
  const byEmployee = await computeStoreHoursByEmployee(workDate);

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, employeeCode: true, name: true },
  });
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  const detail: { employeeId: string; employeeCode: string; name: string; workHours: number }[] = [];
  for (const [empId, storeHours] of byEmployee.entries()) {
    const hours = storeHours[storeId];
    if (hours == null || hours <= 0) continue;
    const emp = employeeMap.get(empId);
    detail.push({
      employeeId: empId,
      employeeCode: emp?.employeeCode ?? "",
      name: emp?.name ?? "",
      workHours: hours,
    });
  }

  return NextResponse.json({ workDate: date, storeId, detail });
}
