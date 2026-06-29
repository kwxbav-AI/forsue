import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.attendanceRecord.groupBy({
    by: ["workDate", "originalStoreId"],
    where: { workHours: { gt: 0 } },
    _count: { employeeId: true },
    orderBy: { _count: { employeeId: "desc" } },
    take: 10,
  });
  const storeIds = [...new Set(rows.map((r) => r.originalStoreId).filter(Boolean))] as string[];
  const stores = await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } });
  const nameById = new Map(stores.map((s) => [s.id, s.name]));
  return NextResponse.json(
    rows.map((r) => ({
      date: r.workDate.toISOString().slice(0, 10),
      store: nameById.get(r.originalStoreId ?? "") ?? r.originalStoreId,
      count: r._count.employeeId,
    }))
  );
}
