import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("startDate")?.trim();
  const endDate = sp.get("endDate")?.trim();
  const storeId = sp.get("storeId")?.trim();

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "請提供 startDate 與 endDate" }, { status: 400 });
  }

  const workDateWhere = {
    workDate: { gte: parseDateOnlyUTC(startDate), lte: parseDateOnlyUTC(endDate) },
  };

  // 查出所有員工的本店
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      defaultStoreId: true,
      defaultStore: { select: { name: true } },
    },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // 查出範圍內的出勤紀錄
  const attendanceWhere: object = storeId
    ? { ...workDateWhere, originalStoreId: storeId }
    : workDateWhere;
  const attendances = await prisma.attendanceRecord.findMany({
    where: attendanceWhere,
    select: {
      id: true,
      workDate: true,
      employeeId: true,
      originalStoreId: true,
      clockInStoreId: true,
      workHours: true,
    },
  });

  // 查出範圍內的調度紀錄
  const dispatches = await prisma.dispatchRecord.findMany({
    where: workDateWhere,
    select: {
      id: true,
      workDate: true,
      employeeId: true,
      fromStoreId: true,
      toStoreId: true,
      dispatchHours: true,
      confirmStatus: true,
    },
  });

  // 建立調度紀錄 index：key = `${employeeId}|${dateStr}`
  function dateKey(d: Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const dispatchSet = new Set(
    dispatches.map((d) => `${d.employeeId}|${dateKey(d.workDate)}`)
  );

  // 查門市名稱
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  type AuditRow = {
    attendanceId: string;
    workDate: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    defaultStoreId: string | null;
    defaultStoreName: string | null;
    workedStoreId: string | null;
    workedStoreName: string | null;
    workHours: number;
  };

  const missingDispatch: AuditRow[] = [];

  for (const att of attendances) {
    const emp = empMap.get(att.employeeId);
    if (!emp) continue;
    // 只關心有實際工時的紀錄
    if (Number(att.workHours) <= 0) continue;
    // originalStoreId 即出勤的門市
    const workedStoreId = att.originalStoreId;
    if (!workedStoreId) continue;
    // 若出勤門市 = 本店，不需調度
    if (workedStoreId === emp.defaultStoreId) continue;

    const key = `${att.employeeId}|${dateKey(att.workDate)}`;
    if (!dispatchSet.has(key)) {
      missingDispatch.push({
        attendanceId: att.id,
        workDate: dateKey(att.workDate),
        employeeId: att.employeeId,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        defaultStoreId: emp.defaultStoreId ?? null,
        defaultStoreName: emp.defaultStoreId ? (storeNameById.get(emp.defaultStoreId) ?? null) : null,
        workedStoreId,
        workedStoreName: storeNameById.get(workedStoreId) ?? null,
        workHours: Number(att.workHours),
      });
    }
  }

  // 排序：日期 desc, 員工名
  missingDispatch.sort((a, b) =>
    b.workDate.localeCompare(a.workDate) || a.employeeName.localeCompare(b.employeeName)
  );

  return NextResponse.json({
    startDate,
    endDate,
    missingDispatch,
    total: missingDispatch.length,
  });
}
