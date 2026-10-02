import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth-server";
import { businessDayWorkDateFromDate, formatDateOnly, toStartOfDay } from "@/lib/date";
import { getReserveStaffSettingsForDate } from "@/lib/reserve-staff-periods";
import {
  buildAssignedByStore,
  deriveReserveStaffContext,
  isExcludedFromStoreRoster,
} from "@/modules/performance/services/attendance-allocation.service";

export const dynamic = "force-dynamic";

const LEAVE_SHIFT_RE = /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/;

/**
 * 診斷儲備人力 70% 為何未折算
 * GET /api/dev/reserve-debug?date=2026-09-03&employeeCode=T2608524
 *
 * 名冊（assignedByStore）與「全店到齊」判斷與出勤報表／每日績效引擎走同一套邏輯
 * （isActive 員工 + 無所屬門市者以最近一筆出勤門市 fallback，再交給 deriveReserveStaffContext），
 * 並逐一列出名冊成員當日狀態，方便直接看出是誰讓 storeFull 不成立。
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

  // 當日 period 查詢結果（null 表示當日沒有任何期間涵蓋；出勤報表此時會退回 employee.isReserveStaff）
  const reserveSettings = await getReserveStaffSettingsForDate(workDate, [emp.id]);
  const settingForDate = reserveSettings.get(emp.id) ?? null;
  const effectiveSetting = settingForDate ?? {
    isReserveStaff: emp.isReserveStaff,
    reserveWorkPercent: emp.reserveWorkPercent == null ? null : Number(emp.reserveWorkPercent),
  };

  // 名冊：與出勤報表／引擎相同
  const activeEmployees = await prisma.employee.findMany({
    where: { isActive: true },
    select: { id: true, name: true, employeeCode: true, position: true, defaultStoreId: true, hireDate: true, leaveDate: true },
  });
  const noDefaultIds = activeEmployees.filter((e) => !e.defaultStoreId).map((e) => e.id);
  const fallbackHomeStoreByEmployee = new Map<string, string>();
  if (noDefaultIds.length > 0) {
    const attRecords = await prisma.attendanceRecord.findMany({
      where: { employeeId: { in: noDefaultIds }, originalStoreId: { not: null } },
      select: { employeeId: true, originalStoreId: true },
      orderBy: { workDate: "desc" },
    });
    for (const a of attRecords) {
      if (!a.originalStoreId) continue;
      if (fallbackHomeStoreByEmployee.has(a.employeeId)) continue;
      fallbackHomeStoreByEmployee.set(a.employeeId, a.originalStoreId);
    }
  }
  const assignedByStore = buildAssignedByStore(activeEmployees, fallbackHomeStoreByEmployee, dateStr);

  const homeStoreId = emp.defaultStoreId ?? fallbackHomeStoreByEmployee.get(emp.id) ?? null;
  // 所屬門市為本店、但因工號（a/b/E 開頭）或離職日已過而被排除在當日名冊外的人（僅供對照）
  const excludedFromRoster = activeEmployees
    .filter((e) => (e.defaultStoreId ?? fallbackHomeStoreByEmployee.get(e.id)) === homeStoreId)
    .map((e) => ({
      employeeCode: e.employeeCode,
      name: e.name,
      reason: isExcludedFromStoreRoster(e.employeeCode ?? "")
        ? "試作（a/b 開頭）或 E 開頭工號"
        : e.leaveDate && formatDateOnly(e.leaveDate) < dateStr
          ? `離職日 ${formatDateOnly(e.leaveDate)} 已過`
          : null,
    }))
    .filter((e) => e.reason != null);
  const homeStore = homeStoreId
    ? await prisma.store.findUnique({ where: { id: homeStoreId }, select: { id: true, name: true } })
    : null;

  // 當日全部出勤／已確認調度
  const [allAtts, allDispatches] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { workDate: exactWorkDate },
      select: {
        employeeId: true,
        originalStoreId: true,
        workHours: true,
        scheduledWorkHours: true,
        shiftType: true,
        employee: { select: { defaultStoreId: true } },
      },
    }),
    prisma.dispatchRecord.findMany({
      where: { workDate: exactWorkDate, confirmStatus: "已確認" },
      select: { id: true, employeeId: true, fromStoreId: true, toStoreId: true, remark: true },
    }),
  ]);

  const context = deriveReserveStaffContext({
    attendances: allAtts,
    dispatches: allDispatches,
    assignedByStore,
    fallbackHomeStoreByEmployee,
  });

  const storeFull = homeStoreId ? (context.storeFullByStoreId.get(homeStoreId) ?? false) : false;
  const storeOvertime = homeStoreId ? (context.storeOvertimeByStoreId.get(homeStoreId) ?? 0) : 0;
  const hasConfirmedDispatch = context.hasConfirmedDispatchByEmployeeId.has(emp.id);

  // 名冊逐人狀態
  const employeeById = new Map(activeEmployees.map((e) => [e.id, e]));
  const rosterIds = homeStoreId ? (assignedByStore.get(homeStoreId) ?? []) : [];
  const roster = rosterIds.map((id) => {
    const e = employeeById.get(id)!;
    const atts = allAtts.filter((a) => a.employeeId === id);
    const present = atts.some((a) => Number(a.workHours) > 0);
    const leaveReasons: string[] = [];
    for (const a of atts) {
      const actual = Number(a.workHours);
      const scheduled = a.scheduledWorkHours != null ? Number(a.scheduledWorkHours) : null;
      const isPartTimeShift = (a.shiftType ?? "").toUpperCase().startsWith("PT");
      if (!isPartTimeShift && scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && actual < scheduled) {
        leaveReasons.push(`實際工時 ${actual} < 表定工時 ${scheduled}（班別：${a.shiftType ?? "—"}）`);
      }
      if (LEAVE_SHIFT_RE.test((a.shiftType ?? "").trim())) {
        leaveReasons.push(`班別標示為假別：${a.shiftType}`);
      }
    }
    return {
      employeeCode: e.employeeCode,
      name: e.name,
      position: e.position,
      viaFallback: !e.defaultStoreId,
      hireDate: e.hireDate ? formatDateOnly(e.hireDate) : null,
      leaveDate: e.leaveDate ? formatDateOnly(e.leaveDate) : null,
      present,
      leaveReasons,
      attendances: atts.map((a) => ({
        workHours: Number(a.workHours),
        scheduledWorkHours: a.scheduledWorkHours == null ? null : Number(a.scheduledWorkHours),
        shiftType: a.shiftType,
      })),
    };
  });

  const dispatchesOut = allDispatches.filter((d) => {
    const from = d.fromStoreId || allAtts.find((a) => a.employeeId === d.employeeId && a.originalStoreId)?.originalStoreId || null;
    return from === homeStoreId;
  });

  // 未折算原因（依報表判斷順序）
  const codePrefix = (emp.employeeCode ?? "").trim().toLowerCase();
  const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
  const blockers: string[] = [];
  if (isTrial) blockers.push("工號為 a/b 開頭（試作人員），不套用儲備人力折算");
  if (!effectiveSetting.isReserveStaff) {
    blockers.push(
      settingForDate
        ? `${dateStr} 所在的期間設定為「非儲備人力」（請看 periods，生效日可能晚於這一天）`
        : "當日沒有任何期間涵蓋，且員工目前未勾選儲備人力"
    );
  } else if (effectiveSetting.reserveWorkPercent == null) {
    blockers.push("當日為儲備人力但未設定工時計算%");
  }
  if (hasConfirmedDispatch) blockers.push("員工當日有已確認調度，不套用儲備人力折算");
  if (!homeStoreId) blockers.push("員工沒有所屬門市（也沒有可 fallback 的出勤門市）");
  for (const r of roster) {
    const who = `${r.employeeCode} ${r.name}`;
    if (!r.present) {
      const hints = [
        r.viaFallback ? "無所屬門市，因最近一筆出勤在本店而被算進名冊" : null,
        r.hireDate && r.hireDate > dateStr ? `到職日 ${r.hireDate} 晚於查詢日` : null,
      ].filter(Boolean);
      blockers.push(`未到齊：${who} 當日沒有工時 > 0 的出勤${hints.length ? `（${hints.join("；")}）` : ""}`);
    }
    for (const reason of r.leaveReasons) blockers.push(`視為請假：${who} ${reason}`);
  }
  if (dispatchesOut.length > 0 && !storeFull) {
    blockers.push(`本店當日有 ${dispatchesOut.length} 筆已確認調度調出（非成對的跨店學習即視為未到齊）`);
  }
  if (storeOvertime > 3) blockers.push(`本店當日加班總時數 ${Math.round(storeOvertime * 100) / 100} 超過 3 小時`);

  const shouldPartial =
    !isTrial &&
    effectiveSetting.isReserveStaff &&
    effectiveSetting.reserveWorkPercent != null &&
    !hasConfirmedDispatch &&
    storeFull &&
    storeOvertime <= 3;

  return NextResponse.json({
    date: dateStr,
    employee: { ...emp, hireDate: emp.hireDate ? formatDateOnly(emp.hireDate) : null },
    homeStore,
    periods: periods.map((p) => ({
      ...p,
      effectiveFrom: formatDateOnly(p.effectiveFrom),
      effectiveTo: p.effectiveTo ? formatDateOnly(p.effectiveTo) : null,
      reserveWorkPercent: p.reserveWorkPercent == null ? null : Number(p.reserveWorkPercent),
    })),
    settingForDate,
    effectiveSetting,
    storeFull,
    storeOvertime: Math.round(storeOvertime * 100) / 100,
    hasConfirmedDispatch,
    isTrial,
    shouldPartial,
    blockers,
    roster,
    excludedFromRoster,
    dispatchesOut,
  });
}
