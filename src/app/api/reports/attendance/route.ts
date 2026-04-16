import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatDateOnly, formatDateOnlyTaipei, toDateRange, toDateRangeTaipei } from "@/lib/date";
import Decimal from "decimal.js";

export const dynamic = "force-dynamic";

function newHirePercentByDays(dayNo: number): number {
  if (!Number.isFinite(dayNo) || dayNo <= 0) return 1;
  if (dayNo >= 1 && dayNo <= 5) return 0;
  if (dayNo >= 6 && dayNo <= 10) return 0.5;
  if (dayNo >= 11 && dayNo <= 15) return 0.7;
  if (dayNo >= 16 && dayNo <= 20) return 0.9;
  return 1;
}

function buildWorkedDayNoIndex(
  attendanceRows: { employeeId: string; workDate: Date }[],
  hireDateByEmployeeId: Map<string, Date>
): Map<string, Map<string, number>> {
  const dateSetByEmp = new Map<string, Set<string>>();
  for (const r of attendanceRows) {
    const hire = hireDateByEmployeeId.get(r.employeeId);
    if (!hire) continue;
    // 以日曆日比較，避免時區/時間戳造成邊界誤判
    if (formatDateOnly(r.workDate) < formatDateOnly(hire)) continue;
    const dayStr = formatDateOnly(r.workDate);
    if (!dateSetByEmp.has(r.employeeId)) dateSetByEmp.set(r.employeeId, new Set());
    dateSetByEmp.get(r.employeeId)!.add(dayStr);
  }

  const index = new Map<string, Map<string, number>>();
  for (const [empId, set] of dateSetByEmp.entries()) {
    const sorted = Array.from(set).sort();
    const byDate = new Map<string, number>();
    for (let i = 0; i < sorted.length; i++) {
      byDate.set(sorted[i], i + 1); // dayNo 從 1 開始
    }
    index.set(empId, byDate);
  }
  return index;
}

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  STAFF_SHORTAGE: "人力不足",
  MEETING_REVIEW: "會議/考核",
  RESERVE_STAFF: "儲備人力",
  TRIAL: "試作",
  MANAGER_MEETING: "店長會議",
  PROMOTION_REVIEW: "晉升考核",
  OTHER: "其他",
};

export type AttendanceReportRow =
  | {
      type: "attendance";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      adjustmentReason: null;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "adjustment";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "dispatch_out";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "dispatch_in";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      adjustmentReason: string;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    }
  | {
      type: "subtotal";
      id: string;
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string;
      position: string;
      workDate: string;
      workHours: number;
      adjustmentReason: null;
      locationMatchStatus: string | null;
      clockInStoreText: string | null;
      clockOutStoreText: string | null;
    };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const todayStr = formatDateOnlyTaipei();
  const startDate = searchParams.get("startDate") || todayStr;
  const endDate = searchParams.get("endDate") || startDate;
  const employeeCode = searchParams.get("employeeCode")?.trim() || "";
  const name = searchParams.get("name")?.trim() || "";
  const department = searchParams.get("department")?.trim() || "";
  const matchStatus = searchParams.get("matchStatus")?.trim() || "";
  const allowedMatchStatus = new Set([
    "MATCH",
    "MISMATCH_CLOCKIN",
    "MISMATCH_CLOCKOUT",
    "MISMATCH_BOTH",
    "DISPATCH_EXPLAINED",
    "NEED_REVIEW",
    "EXCLUDED",
    "UNKNOWN",
  ]);
  const matchStatusFilter = matchStatus && allowedMatchStatus.has(matchStatus) ? matchStatus : "";

  let rangeTaipei: { start: Date; end: Date };
  let rangeUtcDay: { start: Date; end: Date };
  try {
    // 出勤資料以「台北營運日」為準寫入 DB（避免 UTC/本地午夜混用），報表查詢必須用同一套日曆日轉換
    rangeTaipei = toDateRangeTaipei(startDate, endDate);
    // 相容舊資料：歷史版本可能以「UTC 日曆日 00:00」儲存 workDate；因此查詢用兩種區間取聯集，避免整批查不到
    rangeUtcDay = toDateRange(startDate, endDate);
  } catch {
    return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });
  }

  const attendanceWorkDateWhere: Prisma.AttendanceRecordWhereInput = {
    OR: [
      { workDate: { gte: rangeTaipei.start, lte: rangeTaipei.end } },
      { workDate: { gte: rangeUtcDay.start, lte: rangeUtcDay.end } },
    ],
  };
  const dispatchWorkDateWhere = attendanceWorkDateWhere as unknown as Prisma.DispatchRecordWhereInput;
  const adjustmentWorkDateWhere =
    attendanceWorkDateWhere as unknown as Prisma.WorkhourAdjustmentWhereInput;

  try {
    const activeEmployees = await prisma.employee.findMany({
      where: { isActive: true },
      select: { id: true, defaultStoreId: true },
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
    const assignedByStore = new Map<string, string[]>();
    for (const e of activeEmployees) {
      const homeStoreId = e.defaultStoreId ?? fallbackHomeStoreByEmployee.get(e.id);
      if (!homeStoreId) continue;
      const list = assignedByStore.get(homeStoreId) ?? [];
      list.push(e.id);
      assignedByStore.set(homeStoreId, list);
    }

    // 出勤明細需要能顯示「被隱藏門市」的原始出勤資料；此處載入所有啟用門市供顯示/部門篩選
    const allStores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, department: true },
    });
    const storeById = new Map(allStores.map((s) => [s.id, s]));
    const deptToStoreIds = new Map<string, string[]>();
    for (const s of allStores) {
      const dept = (s.department || s.name || "").trim();
      if (!dept) continue;
      if (!deptToStoreIds.has(dept)) deptToStoreIds.set(dept, []);
      deptToStoreIds.get(dept)!.push(s.id);
    }
    const keyword = department.trim().toLowerCase();
    const storeIdsForFilter =
      keyword === ""
        ? null
        : allStores
            .filter(
              (s) =>
                ((s.department || "") + " " + (s.name || "")).toLowerCase().includes(keyword)
            )
            .map((s) => s.id);

    const empWhere =
      employeeCode || name
        ? {
            ...(employeeCode
              ? { employeeCode: { contains: employeeCode, mode: "insensitive" as const } }
              : {}),
            ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
          }
        : undefined;

    const recordsRaw = await prisma.attendanceRecord.findMany({
      where: {
        AND: [
          attendanceWorkDateWhere,
          ...(empWhere ? [{ employee: empWhere }] : []),
          ...(storeIdsForFilter && storeIdsForFilter.length > 0
            ? [{ originalStoreId: { in: storeIdsForFilter } }]
            : []),
          ...(matchStatusFilter ? [{ locationMatchStatus: matchStatusFilter as any }] : []),
        ],
      },
      include: {
        employee: { include: { defaultStore: true } },
      },
      orderBy: [{ workDate: "asc" }, { employee: { employeeCode: "asc" } }],
    });

    const recordsById = new Map<string, (typeof recordsRaw)[number]>();
    for (const r of recordsRaw) recordsById.set(r.id, r);
    const records = Array.from(recordsById.values());

    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId))
    ) as string[];

    // 新進員工折算：改用「實際有上班日」累計天數（workHours > 0 的出勤日）。
    // 為避免在迴圈中逐筆查 DB，先把本次報表涉及的員工在日期區間內的「有上班」出勤日一次撈出來做索引。
    const hireDateByEmployeeId = new Map<string, Date>();
    for (const r of records) {
      if (r.employee.hireDate) hireDateByEmployeeId.set(r.employeeId, r.employee.hireDate);
    }
    const workedAttendanceRows =
      employeeIds.length > 0
        ? await prisma.attendanceRecord.findMany({
            where: {
              employeeId: { in: employeeIds },
              OR: [
                { workDate: { gte: rangeTaipei.start, lte: rangeTaipei.end } },
                { workDate: { gte: rangeUtcDay.start, lte: rangeUtcDay.end } },
              ],
              workHours: { gt: 0 },
            },
            select: { employeeId: true, workDate: true },
            orderBy: [{ employeeId: "asc" }, { workDate: "asc" }],
          })
        : [];
    const workedDayNoIndexByEmployeeId = buildWorkedDayNoIndex(
      workedAttendanceRows,
      hireDateByEmployeeId
    );

    const [adjustments, dispatches] = await Promise.all([
      employeeIds.length > 0
        ? prisma.workhourAdjustment.findMany({
            where: {
              AND: [adjustmentWorkDateWhere, { employeeId: { in: employeeIds } }],
            },
            include: { employee: true },
            orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
          })
        : ([] as any[]),
      prisma.dispatchRecord.findMany({
        where: {
          AND: [
            dispatchWorkDateWhere,
            { confirmStatus: "已確認" },
            ...(employeeIds.length > 0 ? [{ employeeId: { in: employeeIds } }] : []),
          ],
        },
        include: { employee: true },
        orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
      }),
    ]);

    const extractDispatchReason = (remark: string | null): string => {
      if (!remark) return "";
      const s = remark.trim();
      if (!s) return "";
      return s.split("/")[0].trim();
    };

    // 針對「儲備人力」計算：判定「全店到齊」與「加班總時數」必須看整間店的資料，
    // 不能被姓名/工號搜尋（empWhere）篩到只剩一個人，否則會誤判未到齊。
    const storeFullByDateStore = new Map<string, boolean>();
    const overtimeByDateStore = new Map<string, number>();

    const reserveHomeStoreIds = new Set<string>();
    const reserveEmployeeIds = new Set<string>();
    for (const r of records) {
      if (!r.employee.isReserveStaff) continue;
      reserveEmployeeIds.add(r.employeeId);
      const homeStoreId =
        r.employee.defaultStoreId ??
        fallbackHomeStoreByEmployee.get(r.employeeId) ??
        r.originalStoreId ??
        null;
      if (homeStoreId) reserveHomeStoreIds.add(homeStoreId);
    }

    if (reserveHomeStoreIds.size > 0) {
      const datesForCalc = Array.from(
        new Set(records.map((r) => formatDateOnly(r.workDate)))
      );
      const calcEmployeeIds = new Set<string>();
      reserveHomeStoreIds.forEach((sid) => {
        const empIds = assignedByStore.get(sid) ?? [];
        for (const eid of empIds) calcEmployeeIds.add(eid);
      });
      const calcEmployeeIdList = Array.from(calcEmployeeIds);

      const [calcAttendances, calcDispatches] = await Promise.all([
        calcEmployeeIdList.length > 0
          ? prisma.attendanceRecord.findMany({
              where: {
                AND: [attendanceWorkDateWhere, { employeeId: { in: calcEmployeeIdList } }],
              },
              select: {
                workDate: true,
                employeeId: true,
                originalStoreId: true,
                workHours: true,
                scheduledWorkHours: true,
                shiftType: true,
                employee: { select: { defaultStoreId: true } },
              },
              orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
            })
          : [],
        prisma.dispatchRecord.findMany({
          where: {
            AND: [
              dispatchWorkDateWhere,
            ],
            OR: [
              { fromStoreId: { in: Array.from(reserveHomeStoreIds) } },
              { toStoreId: { in: Array.from(reserveHomeStoreIds) } },
            ],
          },
          select: { workDate: true, fromStoreId: true, toStoreId: true, remark: true },
          orderBy: [{ workDate: "asc" }],
        }),
      ]);

      const attendanceIdsByDateStore = new Map<string, Set<string>>();
      const leaveIdsByDateStore = new Map<string, Set<string>>();
      for (const a of calcAttendances) {
        const ds = formatDateOnly(a.workDate);
        const storeId =
          a.employee.defaultStoreId ??
          fallbackHomeStoreByEmployee.get(a.employeeId) ??
          a.originalStoreId ??
          null;
        if (!storeId) continue;
        const k = `${ds}|${storeId}`;
        if (!attendanceIdsByDateStore.has(k)) attendanceIdsByDateStore.set(k, new Set());
        // 到齊判斷：必須有實際上班（workHours > 0）才算到場（避免 8 小時門檻誤傷兼職）
        if (Number(a.workHours) > 0) {
          attendanceIdsByDateStore.get(k)!.add(a.employeeId);
        }

        const st = a.shiftType ? String(a.shiftType).trim() : "";
        const byText = st ? /(特休|事假|病假|公假|補休|喪假|婚假|產假|育嬰|請假|休假|半天)/.test(st) : false;
        const scheduled =
          a.scheduledWorkHours != null ? Number(a.scheduledWorkHours) : null;
        const byScheduled =
          scheduled != null && Number.isFinite(scheduled) && scheduled > 0 && Number(a.workHours) < scheduled;
        const isLeave = byText || byScheduled;
        if (isLeave) {
          if (!leaveIdsByDateStore.has(k)) leaveIdsByDateStore.set(k, new Set());
          leaveIdsByDateStore.get(k)!.add(a.employeeId);
        }

        const workH = Number(a.workHours);
        const overtime = Math.max(0, workH - 8);
        overtimeByDateStore.set(k, (overtimeByDateStore.get(k) ?? 0) + overtime);
      }

      const learningOutCountByDateStore = new Map<string, number>();
      const learningInCountByDateStore = new Map<string, number>();
      const otherOutCountByDateStore = new Map<string, number>();
      for (const dr of calcDispatches) {
        const ds = formatDateOnly(dr.workDate);
        const reason = extractDispatchReason(dr.remark ?? null);
        if (dr.fromStoreId) {
          const k = `${ds}|${dr.fromStoreId}`;
          if (reason === "跨店學習") {
            learningOutCountByDateStore.set(k, (learningOutCountByDateStore.get(k) ?? 0) + 1);
          } else {
            otherOutCountByDateStore.set(k, (otherOutCountByDateStore.get(k) ?? 0) + 1);
          }
        }
        if (reason === "跨店學習") {
          const k = `${ds}|${dr.toStoreId}`;
          learningInCountByDateStore.set(k, (learningInCountByDateStore.get(k) ?? 0) + 1);
        }
      }

      for (const ds of datesForCalc) {
        reserveHomeStoreIds.forEach((storeId) => {
          const k = `${ds}|${storeId}`;
          const empIds = assignedByStore.get(storeId) ?? [];
          const presentIds = attendanceIdsByDateStore.get(k) ?? new Set<string>();
          const allPresent = empIds.length > 0 && empIds.every((id) => presentIds.has(id));
          const leaveIds = leaveIdsByDateStore.get(k) ?? new Set<string>();
          const hasLeave = empIds.some((id) => leaveIds.has(id));

          const otherOut = otherOutCountByDateStore.get(k) ?? 0;
          const learningOut = learningOutCountByDateStore.get(k) ?? 0;
          const learningIn = learningInCountByDateStore.get(k) ?? 0;
          const learningPaired = learningOut > 0 && learningIn === learningOut;
          const hasNetDispatchOut = otherOut > 0 || (learningOut > 0 && !learningPaired);

          storeFullByDateStore.set(k, allPresent && !hasNetDispatchOut && !hasLeave);
        });
      }
    }

    if (storeIdsForFilter && storeIdsForFilter.length > 0) {
      const dispatchInOnly = await prisma.dispatchRecord.findMany({
        where: {
          AND: [
            dispatchWorkDateWhere,
            { confirmStatus: "已確認" },
            { toStoreId: { in: storeIdsForFilter } },
            ...(empWhere ? [{ employee: empWhere }] : []),
          ],
        },
        include: { employee: true },
      });
      for (const d of dispatchInOnly) {
        if (!employeeIds.includes(d.employeeId)) employeeIds.push(d.employeeId);
      }
      dispatches.push(...dispatchInOnly);
    }

    const attByEmpDate = new Map<string, typeof records[0]>();
    for (const r of records) {
      const k = `${r.employeeId}|${formatDateOnly(r.workDate)}`;
      attByEmpDate.set(k, r);
    }
    const adjByEmpDate = new Map<string, typeof adjustments>();
    for (const a of adjustments) {
      const k = `${a.employeeId}|${formatDateOnly(a.workDate)}`;
      if (!adjByEmpDate.has(k)) adjByEmpDate.set(k, []);
      adjByEmpDate.get(k)!.push(a);
    }
    const dispByEmpDate = new Map<string, typeof dispatches>();
    for (const d of dispatches) {
      const k = `${d.employeeId}|${formatDateOnly(d.workDate)}`;
      if (!dispByEmpDate.has(k)) dispByEmpDate.set(k, []);
      dispByEmpDate.get(k)!.push(d);
    }

    const rows: AttendanceReportRow[] = [];

    const getDept = (
      storeId: string | null,
      emp: any
    ): string => {
      if (storeId) {
        const s = storeById.get(storeId);
        if (s) return (s.department || s.name || "").trim() || "—";
      }
      const def = emp.defaultStore;
      return (def?.department || def?.name || "").trim() || "—";
    };

    const sortedKeys = new Set<string>();
    for (const r of records) {
      sortedKeys.add(`${r.employeeId}|${formatDateOnly(r.workDate)}`);
    }
    for (const d of dispatches) {
      if (storeIdsForFilter && storeIdsForFilter.includes(d.toStoreId))
        sortedKeys.add(`${d.employeeId}|${formatDateOnly(d.workDate)}`);
    }
    const sortedKeyList = Array.from(sortedKeys).sort();

    for (const key of sortedKeyList) {
      const [empId, dateStr] = key.split("|");
      const att = attByEmpDate.get(key);
      const adjList = adjByEmpDate.get(key) || [];
      const dispList = dispByEmpDate.get(key) || [];

      const emp = att?.employee ?? dispList[0]?.employee ?? adjList[0]?.employee;
      if (!emp) continue;

      const empCode = emp.employeeCode;
      const empName = emp.name;
      const position = emp.position ?? "";

      const storeIdForAtt = att?.originalStoreId ?? emp.defaultStoreId ?? null;
      const deptForAtt = getDept(storeIdForAtt, emp);

      const applyToThisStore = (sid: string | null): boolean => {
        if (!storeIdsForFilter || storeIdsForFilter.length === 0) return true;
        return sid !== null && storeIdsForFilter.includes(sid);
      };

      const attStoreOk = !storeIdsForFilter || (storeIdForAtt && storeIdsForFilter.includes(storeIdForAtt));

      if (att && attStoreOk) {
        const baseHours = Number(att.workHours);
        let net = baseHours;

        rows.push({
          type: "attendance",
          id: att.id,
          employeeId: emp.id,
          employeeCode: empCode,
          name: empName,
          department: deptForAtt,
          position,
          workDate: dateStr,
          workHours: baseHours,
          adjustmentReason: null,
          locationMatchStatus: (att as any).locationMatchStatus ?? null,
          clockInStoreText: (att as any).clockInStoreText ?? null,
          clockOutStoreText: (att as any).clockOutStoreText ?? null,
        });

        // 試作規則：員工編號開頭為 A/B（不分大小寫）時，小計固定為 -3
        // 做法：保留原工時一行，新增一行調整 = -(原工時 + 3)，使 net 變成 -3
        const codePrefix = (empCode || "").trim().toLowerCase();
        const isTrial = codePrefix.startsWith("a") || codePrefix.startsWith("b");
        if (isTrial) {
          const delta = new Decimal(baseHours).plus(3).mul(-1).toNumber(); // 例如 4.62 -> -7.62
          net += delta;
          rows.push({
            type: "adjustment",
            id: `trial-${att.id}`,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: deptForAtt,
            position,
            workDate: dateStr,
            workHours: Math.round(delta * 100) / 100,
            adjustmentReason: "試作",
            locationMatchStatus: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        // 後勤支援門市（已確認）：出勤工時以 70% 計，顯示「-30%」調整行
        const hasBackofficeConfirmed = dispList.some((d) => {
          const reason = extractDispatchReason(d.remark ?? null);
          return reason === "後勤支援門市" && d.confirmStatus === "已確認";
        });
        if (!isTrial && hasBackofficeConfirmed) {
          const delta = new Decimal(baseHours).mul(-0.3).toNumber();
          net += delta;
          rows.push({
            type: "adjustment",
            id: `backoffice-${att.id}`,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: deptForAtt,
            position,
            workDate: dateStr,
            workHours: Math.round(delta * 100) / 100,
            adjustmentReason: "後勤支援門市以70%工時",
            locationMatchStatus: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        // 儲備人力：保留原工時一行，另新增「儲備人力」調整行（負數），小計才會是折算後工時
        if (!isTrial && !hasBackofficeConfirmed && emp.isReserveStaff) {
          const homeStoreId =
            emp.defaultStoreId ?? fallbackHomeStoreByEmployee.get(emp.id) ?? null;
          if (homeStoreId) {
            const k = `${dateStr}|${homeStoreId}`;
            const storeFull = storeFullByDateStore.get(k) ?? false;
            const overtimeTotal = overtimeByDateStore.get(k) ?? 0;
            const percent =
              emp.reserveWorkPercent == null ? null : Number(emp.reserveWorkPercent);
            if (
              storeFull &&
              overtimeTotal <= 3 &&
              percent != null &&
              Number.isFinite(percent)
            ) {
              const adjusted = new Decimal(baseHours)
                .mul(new Decimal(percent).div(100))
                .toNumber();
              const delta = new Decimal(adjusted).minus(baseHours).toNumber(); // 通常為負數
              if (Math.abs(delta) > 0) {
                net += delta;
                const percentLabel =
                  Math.round(percent * 100) / 100; // 最多兩位小數
                rows.push({
                  type: "adjustment",
                  id: `reserve-${att.id}`,
                  employeeId: emp.id,
                  employeeCode: empCode,
                  name: empName,
                  department: deptForAtt,
                  position,
                  workDate: dateStr,
                  workHours: Math.round(delta * 100) / 100,
                  adjustmentReason: `儲備人力，計${percentLabel}%工時`,
                  locationMatchStatus: null,
                  clockInStoreText: null,
                  clockOutStoreText: null,
                });
              }
            }
          }
        }

        // 新進員工工時折算：依到職天數套用工時%（到職日當天算第 1 天）
        if (!isTrial && emp.hireDate && net > 0) {
          const dayNo =
            workedDayNoIndexByEmployeeId.get(emp.id)?.get(dateStr) ??
            // 若沒有出勤日索引（理論上不會發生在 att.workHours > 0），保底為 1
            1;
          const percent = newHirePercentByDays(dayNo);
          if (percent !== 1) {
            const adjusted = new Decimal(net).mul(percent).toNumber();
            const delta = new Decimal(adjusted).minus(net).toNumber();
            if (Math.abs(delta) > 0) {
              net += delta;
              const percentLabel = Math.round(percent * 10000) / 100; // 0~100，兩位小數
              rows.push({
                type: "adjustment",
                id: `newhire-${att.id}`,
                employeeId: emp.id,
                employeeCode: empCode,
                name: empName,
                department: deptForAtt,
                position,
                workDate: dateStr,
                workHours: Math.round(delta * 100) / 100,
                adjustmentReason: `新進員工，計${percentLabel}%工時`,
                locationMatchStatus: null,
                clockInStoreText: null,
                clockOutStoreText: null,
              });
            }
          }
        }

        for (const a of adjList) {
          const adjStoreId = a.storeId || storeIdForAtt;
          if (!applyToThisStore(adjStoreId)) continue;
          const h = Number(a.adjustmentHours);
          net += h;
          const reason =
            ADJUSTMENT_TYPE_LABELS[a.adjustmentType] ?? a.adjustmentType +
              (a.note ? `, ${a.note}` : "");
          rows.push({
            type: "adjustment",
            id: a.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: deptForAtt,
            position,
            workDate: dateStr,
            workHours: h,
            adjustmentReason: reason,
            locationMatchStatus: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        for (const d of dispList) {
          const fromId = d.fromStoreId ?? storeIdForAtt ?? null;
          if (!fromId) continue;
          if (storeIdsForFilter && storeIdsForFilter.length > 0 && !storeIdsForFilter.includes(fromId)) continue;
          const h = d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
          net -= h;
          const toStore = storeById.get(d.toStoreId);
          const toName = toStore?.name ?? toStore?.department ?? d.toStoreId;
          rows.push({
            type: "dispatch_out",
            id: d.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: deptForAtt,
            position,
            workDate: dateStr,
            workHours: -h,
            adjustmentReason: d.remark?.trim() || "支援",
            locationMatchStatus: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }

        rows.push({
          type: "subtotal",
          id: `sub-${att.id}`,
          employeeId: emp.id,
          employeeCode: empCode,
          name: empName,
          department: deptForAtt,
          position,
          workDate: dateStr,
          workHours: Math.round(net * 100) / 100,
          adjustmentReason: null,
          locationMatchStatus: null,
          clockInStoreText: null,
          clockOutStoreText: null,
        });
      } else if (storeIdsForFilter && storeIdsForFilter.length > 0) {
        for (const d of dispList) {
          if (!storeIdsForFilter.includes(d.toStoreId)) continue;
          const h = d.actualHours != null ? Number(d.actualHours) : Number(d.dispatchHours);
          const toStore = storeById.get(d.toStoreId);
          const toDept = toStore ? (toStore.department || toStore.name || "").trim() : "—";
          rows.push({
            type: "dispatch_in",
            id: d.id,
            employeeId: emp.id,
            employeeCode: empCode,
            name: empName,
            department: toDept,
            position,
            workDate: dateStr,
            workHours: h,
            adjustmentReason: d.remark?.trim() || "支援",
            locationMatchStatus: null,
            clockInStoreText: null,
            clockOutStoreText: null,
          });
        }
      }
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error("GET /api/reports/attendance failed", error);
    return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  }
}
