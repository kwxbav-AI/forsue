import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const where = storeId ? { isActive: true, defaultStoreId: storeId } : { isActive: true };
  const employees = await prisma.employee.findMany({
    where,
    include: { defaultStore: { select: { id: true, name: true, code: true, department: true } } },
    orderBy: { employeeCode: "asc" },
  });

  const noDefaultStoreIds = employees.filter((e) => !e.defaultStoreId).map((e) => e.id);
  const fallbackStoreByEmployee = new Map<string, { id: string; name: string; code: string | null; department: string | null }>();
  if (noDefaultStoreIds.length > 0) {
    const attRecords = await prisma.attendanceRecord.findMany({
      where: { employeeId: { in: noDefaultStoreIds }, originalStoreId: { not: null } },
      select: { employeeId: true, originalStoreId: true },
      orderBy: { workDate: "desc" },
    });
    const employeeToStoreId = new Map<string, string>();
    for (const a of attRecords) {
      if (!a.originalStoreId) continue;
      if (employeeToStoreId.has(a.employeeId)) continue;
      employeeToStoreId.set(a.employeeId, a.originalStoreId);
    }
    const storeIds = Array.from(employeeToStoreId.values());
    if (storeIds.length > 0) {
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true, code: true, department: true },
      });
      const storeById = new Map(stores.map((s) => [s.id, s]));
      // 用 forEach 避免非 ES2015 target 下對 Map 的迭代展開型別限制
      employeeToStoreId.forEach((sid, empId) => {
        const store = storeById.get(sid);
        if (store) fallbackStoreByEmployee.set(empId, store);
      });
    }
  }

  return NextResponse.json(
    employees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.name,
      defaultStoreId: e.defaultStoreId,
      defaultStore: e.defaultStore ?? fallbackStoreByEmployee.get(e.id) ?? null,
      position: e.position,
      isReserveStaff: e.isReserveStaff,
      reserveWorkPercent: e.reserveWorkPercent == null ? null : Number(e.reserveWorkPercent),
    }))
  );
}
