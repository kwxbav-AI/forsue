import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, toDateRange } from "@/lib/date";

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
    };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const todayStr = new Date().toISOString().slice(0, 10);
  const startDate = searchParams.get("startDate") || todayStr;
  const endDate = searchParams.get("endDate") || startDate;
  const employeeCode = searchParams.get("employeeCode")?.trim() || "";
  const name = searchParams.get("name")?.trim() || "";
  const department = searchParams.get("department")?.trim() || "";

  let range: { start: Date; end: Date };
  try {
    range = toDateRange(startDate, endDate);
  } catch {
    return NextResponse.json({ error: "日期格式錯誤" }, { status: 400 });
  }

  try {
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

    const records = await prisma.attendanceRecord.findMany({
      where: {
        workDate: { gte: range.start, lte: range.end },
        ...(empWhere ? { employee: empWhere } : {}),
        ...(storeIdsForFilter && storeIdsForFilter.length > 0
          ? { originalStoreId: { in: storeIdsForFilter } }
          : {}),
      },
      include: {
        employee: { include: { defaultStore: true } },
      },
      orderBy: [{ workDate: "asc" }, { employee: { employeeCode: "asc" } }],
    });

    const employeeIds = Array.from(
      new Set(records.map((r) => r.employeeId))
    ) as string[];

    const [adjustments, dispatches] = await Promise.all([
      employeeIds.length > 0
        ? prisma.workhourAdjustment.findMany({
            where: {
              workDate: { gte: range.start, lte: range.end },
              employeeId: { in: employeeIds },
            },
            include: { employee: true },
            orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
          })
        : [],
      prisma.dispatchRecord.findMany({
        where: {
          workDate: { gte: range.start, lte: range.end },
          ...(employeeIds.length > 0 ? { employeeId: { in: employeeIds } } : {}),
        },
        include: { employee: true },
        orderBy: [{ workDate: "asc" }, { employeeId: "asc" }],
      }),
    ]);

    if (storeIdsForFilter && storeIdsForFilter.length > 0) {
      const dispatchInOnly = await prisma.dispatchRecord.findMany({
        where: {
          workDate: { gte: range.start, lte: range.end },
          toStoreId: { in: storeIdsForFilter },
          ...(empWhere ? { employee: empWhere } : {}),
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

    function getDept(storeId: string | null, emp: { defaultStore?: { department: string | null; name: string | null } | null }): string {
      if (storeId) {
        const s = storeById.get(storeId);
        if (s) return (s.department || s.name || "").trim() || "—";
      }
      const def = emp.defaultStore;
      return (def?.department || def?.name || "").trim() || "—";
    }

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
        });

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
