import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";
import { businessDayWorkDateFromDate, formatDateOnly, toStartOfDay } from "@/lib/date";
import { getReserveStaffSettingsForDate } from "@/lib/reserve-staff-periods";

export const dynamic = "force-dynamic";

/**
 * 診斷儲備人力 70% 為何未折算
 * GET /api/dev/reserve-debug?date=2026-09-03&employeeCode=T2608524
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const dateStr = sp.get("date") ?? formatDateOnly(new Date());
  const employeeCode = sp.get("employeeCode") ?? "";

  const workDate = toStartOfDay(dateStr);
  const exactWorkDate = businessDayWorkDateFromDate(workDate);

  // 找員工
  const emp = await prisma.employee.findFirst({
    where: { employeeCode },
    select: { id: true, name: true, employeeCode: true, defaultStoreId: true, isReserveStaff: true, reserveWorkPercent: true, hireDate: true, isActive: true },
  });
  if (!emp) return NextResponse.json({ error: `找不到員工 ${employeeCode}` }, { status: 404 });

  // Period 記錄
  const periods = await prisma.employeeReserveStaffPeriod.findMany({
    where: { employeeId: emp.id },
    orderBy: { effectiveFrom: "asc" },
    select: { effectiveFrom: true, effectiveTo: true, isReserveStaff: true, reserveWorkPercent: true },
  });

  // 當日 period 查詢結果
  const reserveSettings = await getReserveStaffSettingsForDate(workDate, [emp.id]);
  const settingForDate = reserveSettings.get(emp.id) ?? null;

  // 當日出勤
  const atts = await prisma.attendanceRecord.findMany({
    where: { employeeId: emp.id, workDate: exactWorkDate },
    select: { workHours: true, scheduledWorkHours: true, shiftType: true, originalStoreId: true },
  });

  // 當日全部出勤（用於計算 storeFull）
  const allAtts = await prisma.attendanceRecord.findMany({
    where: { workDate: exactWorkDate },
    include: { employee: { select: { id: true, name: true, defaultStoreId: true, employeeCode: true } } },
  });

  // assignedByStore[defaultStoreId]
  const assignedEmps = emp.defaultStoreId
    ? await prisma.employee.findMany({
        where: { isActive: true, defaultStoreId: emp.defaultStoreId },
        select: { id: true, name: true, employeeCode: true },
      })
    : [];

  // 模擬 leaveEmployeeIds
  function isLeaveShiftType(s: string | null | undefined) {
    return /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(s ?? "");
  }
  const leaveEmployeeIds = new Set(
    allAtts.filter((a) => {
      const actual = Number(a.workHours);
      const scheduled = (a as any).scheduledWorkHours != null ? Number((a as any).scheduledWorkHours) : null;
      const byScheduled = scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && actual < scheduled;
      return byScheduled || isLeaveShiftType(a.shiftType);
    }).map((a) => a.employeeId)
  );

  const attendanceEmployeeIds = new Set(allAtts.filter((a) => Number(a.workHours) > 0).map((a) => a.employeeId));

  // storeFull for emp.defaultStoreId
  const allPresent = assignedEmps.every((e) => attendanceEmployeeIds.has(e.id));
  const hasLeave = assignedEmps.some((e) => leaveEmployeeIds.has(e.id));
  const storeFull = allPresent && !hasLeave;

  // overtime for store
  const storeOvertime = allAtts
    .filter((a) => a.employee.defaultStoreId === emp.defaultStoreId)
    .reduce((sum, a) => sum + Math.max(0, Number(a.workHours) - 8), 0);

  const isTrial = (emp.employeeCode ?? "").toLowerCase().startsWith("a") || (emp.employeeCode ?? "").toLowerCase().startsWith("b");

  // dispatches
  const dispatches = await prisma.dispatchRecord.findMany({
    where: { workDate: exactWorkDate, employeeId: emp.id, confirmStatus: "已確認" },
    select: { id: true, fromStoreId: true, toStoreId: true, remark: true },
  });

  return NextResponse.json({
    employee: { ...emp, hireDate: emp.hireDate ? formatDateOnly(emp.hireDate) : null },
    periods: periods.map((p) => ({
      ...p,
      effectiveFrom: formatDateOnly(p.effectiveFrom),
      effectiveTo: p.effectiveTo ? formatDateOnly(p.effectiveTo) : null,
      reserveWorkPercent: p.reserveWorkPercent == null ? null : Number(p.reserveWorkPercent),
    })),
    settingForDate,
    attendances: atts.map((a) => ({ ...a, workHours: Number(a.workHours), scheduledWorkHours: a.scheduledWorkHours == null ? null : Number((a as any).scheduledWorkHours) })),
    assignedEmps,
    allPresent,
    hasLeave,
    storeFull,
    storeOvertime: Math.round(storeOvertime * 100) / 100,
    shouldPartial: storeFull && storeOvertime <= 3,
    isTrial,
    hasConfirmedDispatch: dispatches.length > 0,
    dispatches,
    isInLeaveEmployeeIds: leaveEmployeeIds.has(emp.id),
    leaveReason: atts.map((a) => {
      const actual = Number(a.workHours);
      const scheduled = (a as any).scheduledWorkHours != null ? Number((a as any).scheduledWorkHours) : null;
      return { actual, scheduled, byScheduled: scheduled != null && actual < scheduled, byShiftType: isLeaveShiftType(a.shiftType) };
    }),
  });
}
