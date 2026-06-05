import { NextRequest, NextResponse } from "next/server";
import { computeJournalMonthlyStats } from "@/modules/store-ops/services/journal.service";
import { assertListQueryScope, requireStoreOps } from "@/lib/store-ops-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireStoreOps(req);
  if (!auth.ok) return auth.response;

  const month = req.nextUrl.searchParams.get("month")?.trim();
  const storeId = req.nextUrl.searchParams.get("storeId");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "請提供 month（YYYY-MM）" }, { status: 400 });
  }

  const scopeDenied = assertListQueryScope(auth.ctx, storeId);
  if (scopeDenied) return scopeDenied;

  const items = await computeJournalMonthlyStats(auth.ctx, month, storeId);

  if (storeId?.trim()) {
    const row = items[0];
    if (!row) {
      return NextResponse.json({ error: "找不到門市或無權限" }, { status: 404 });
    }
    return NextResponse.json(row);
  }

  return NextResponse.json({ items });
}
