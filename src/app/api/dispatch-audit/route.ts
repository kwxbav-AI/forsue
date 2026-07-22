import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseDateOnlyUTC } from "@/lib/date";

export const dynamic = "force-dynamic";

// 額外排除的部門關鍵字（後勤/客服/司機等非門市人員）
const EXTRA_EXCLUDED_KEYWORDS = ["後勤", "客服", "司機", "採購", "長興倉", "台北司機", "會計"];

function dateKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function normalizeDept(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function isDeptExcluded(department: string | null, excludedList: string[]): boolean {
  if (!department) return false;
  const dept = department.trim();
  if (!dept) return false;
  const deptNorm = normalizeDept(dept);
  // 完全符合排除清單
  if (excludedList.some((ex) => normalizeDept(ex) === deptNorm)) return true;
  // 額外關鍵字：部門名稱包含即排除
  if (EXTRA_EXCLUDED_KEYWORDS.some((kw) => dept.includes(kw))) return true;
  return false;
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

  // 讀系統設定的排除部門清單（與出勤上傳共用同一份）
  const settingRow = await prisma.appSetting.findUnique({
    where: { key: "attendance.location.excludedDepartments" },
    select: { valueJson: true },
  });
  const excludedDepts: string[] = Array.isArray(settingRow?.valueJson)
    ? (settingRow!.valueJson as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  // 查出勤紀錄
  const attendanceWhere: object = filterWorkedStoreId
    ? { ...workDateWhere, clockInStoreId: filterWorkedStoreId }
    : workDateWhere;
  const attendances = await prisma.attendanceRecord.findMany({
    where: attendanceWhere,
    select: {
      id: true,
      workDate: true,
      employeeId: true,
      department: true,       // C欄，用於排除非門市人員
      originalStoreId: true,  // C欄解析結果，本店備援
      clockInStoreId: true,   // J欄，實際打卡門市
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

    // 排除後勤/客服/司機等非門市人員
    if (isDeptExcluded(att.department, excludedDepts)) continue;

    const clockInStoreId = att.clockInStoreId;
    if (!clockInStoreId) continue;

    // defaultStoreId 為 null 時，以 C欄 originalStoreId 作為本店備援
    const effectiveDefaultStoreId = emp.defaultStoreId ?? att.originalStoreId ?? null;

    // 打卡門市 = 本店 → 不需調度
    if (clockInStoreId === effectiveDefaultStoreId) continue;

    // 本店篩選
    if (filterDefaultStoreId && effectiveDefaultStoreId !== filterDefaultStoreId) continue;

    const key = `${att.employeeId}|${dateKey(att.workDate)}`;
    if (!dispatchSet.has(key)) {
      const defaultStoreName = effectiveDefaultStoreId
        ? (storeNameById.get(effectiveDefaultStoreId) ?? `(${effectiveDefaultStoreId})`)
        : null;
      missingDispatch.push({
        attendanceId: att.id,
        workDate: dateKey(att.workDate),
        employeeId: att.employeeId,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        defaultStoreId: effectiveDefaultStoreId,
        defaultStoreName,
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
