import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureRetailStoresFromPerformance } from "@/modules/operations/services/retail-store-sync.service";

export const dynamic = "force-dynamic";

/**
 * 從「門市管理」(Store) 同步至營運門市 (RetailStore)
 */
export async function POST() {
  try {
    const result = await ensureRetailStoresFromPerformance();

    const activeStoreCount = await prisma.retailStore.count({
      where: { isActive: true },
    });

    return NextResponse.json({
      ok: true,
      ...result,
      activeStoreCount,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "同步門市失敗" },
      { status: 500 }
    );
  }
}
