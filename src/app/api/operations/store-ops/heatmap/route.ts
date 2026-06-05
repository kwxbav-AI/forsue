import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, parseDateOnlyUTC } from "@/lib/date";
import { monthStartEndYmd } from "@/lib/month-working-calendar";
import { requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const month = req.nextUrl.searchParams.get("month")?.trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "請提供 month（YYYY-MM）" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const { startYmd, endYmd } = monthStartEndYmd(year, mon);

  const storeWhere =
    auth.ctx.allowedStoreIds === null ?
      { isActive: true }
    : auth.ctx.allowedStoreIds.length > 0 ?
      { id: { in: auth.ctx.allowedStoreIds }, isActive: true }
    : { id: "__none__" };

  const stores = await prisma.retailStore.findMany({
    where: storeWhere,
    select: { id: true, storeName: true, region: true },
    orderBy: [{ region: "asc" }, { storeName: "asc" }],
  });

  const rows = await prisma.dailyStorePerformance.findMany({
    where: {
      storeId: { in: stores.map((s) => s.id) },
      date: {
        gte: parseDateOnlyUTC(startYmd),
        lte: parseDateOnlyUTC(endYmd),
      },
    },
    select: { date: true, customerCount: true, storeId: true },
  });

  return NextResponse.json({
    month,
    startDate: startYmd,
    endDate: endYmd,
    stores,
    cells: rows.map((r) => ({
      date: formatDateOnly(r.date),
      storeId: r.storeId,
      customerCount: r.customerCount,
    })),
  });
}
