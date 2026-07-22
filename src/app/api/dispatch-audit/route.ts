import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

function dateKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const startDate = sp.get("startDate")?.trim();
  const endDate = sp.get("endDate")?.trim();
  const filterDefaultStoreId = sp.get("defaultStoreId")?.trim() || "";
  const filterWorkedStoreId = sp.get("workedStoreId")?.trim() || "";

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "請提供 startDate 與 endDate" }, { status: 400 });
  }

  const workDateWhere = {
    workDate: { gte: parseDateOnlyUTC(startDate), lte: parseDateOnlyUTC(endDate) },
  };

  // 查所有員工（含非在職）
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, name: true, defaultStoreId: true },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // 查門市名稱
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));

  // 查出勤紀錄：改取 clockInStoreId（J欄打卡地點）判斷實際出勤門市
  // 如有 filterWorkedStoreId，直接在 DB 層篩選
  const attendanceWhere: object = filterWorkedStoreId
    ? { ...workDateWhere, clockInStoreId: filterWorkedStoreId }
    : workDateWhere;
  const attendances = await prisma.attendanceRecord.findMany({
    where: attendanceWhere,
    select: {
      id: true,
      workDate: true,
      employeeId: true,
      clockInStoreId: true,   // 實際打卡門市（J欄）
      workHours: true,
    },
  });

  // 查調度紀錄，建立 index
  const dispatches = await prisma.dispatchRecord.findMany({
    where: workDateWhere,
    select: { employeeId: true, workDate: true },
  });
  const dispatchSet = new Set(
    dispatches.map((d) => `${d.employeeId}|${dateKey(d.workDate)}`)
  );

  type AuditRow = {
    attendanceId: string;
    workDate: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    defaultStoreId: string | null;
    defaultStoreName: string | null;
    clockInStoreId: string | null;
    clockInStoreName: string | null;
    workHours: number;
  };

  const missingDispatch: AuditRow[] = [];

  for (const att of attendances) {
    const emp = empMap.get(att.employeeId);
    if (!emp) continue;
    if (Number(att.workHours) <= 0) continue;

    const clockInStoreId = att.clockInStoreId;
    // 沒有打卡地點 → 無法判斷是否跨店
    if (!clockInStoreId) continue;

    // 打卡門市 = 本店 → 不需調度
    if (clockInStoreId === emp.defaultStoreId) continue;

    // 本店篩選
    if (filterDefaultStoreId && emp.defaultStoreId !== filterDefaultStoreId) continue;

    const key = `${att.employeeId}|${dateKey(att.workDate)}`;
    if (!dispatchSet.has(key)) {
      missingDispatch.push({
        attendanceId: att.id,
        workDate: dateKey(att.workDate),
        employeeId: att.employeeId,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        defaultStoreId: emp.defaultStoreId ?? null,
        defaultStoreName: emp.defaultStoreId
          ? (storeNameById.get(emp.defaultStoreId) ?? `(${emp.defaultStoreId})`)
          : null,
        clockInStoreId,
        clockInStoreName: storeNameById.get(clockInStoreId) ?? `(${clockInStoreId})`,
        workHours: Number(att.workHours),
      });
    }
  }

  missingDispatch.sort((a, b) =>
    b.workDate.localeCompare(a.workDate) || a.employeeName.localeCompare(b.employeeName)
  );

  return NextResponse.json({
    startDate,
    endDate,
    stores: stores.map((s) => ({ id: s.id, name: s.name })),
    missingDispatch,
    total: missingDispatch.length,
  });
}
