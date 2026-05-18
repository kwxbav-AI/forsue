import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inferRetailRegion } from "@/lib/operations-dashboard";

export const dynamic = "force-dynamic";

/**
 * 從「門市管理」(Store) 同步至營運門市 (RetailStore)
 */
export async function POST() {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    let created = 0;
    let updated = 0;

    for (const s of stores) {
      const region = inferRetailRegion(s.name, s.department);
      const existing = await prisma.retailStore.findUnique({
        where: { storeName: s.name },
      });

      if (existing) {
        await prisma.retailStore.update({
          where: { id: existing.id },
          data: {
            region,
            isActive: s.isActive,
          },
        });
        updated += 1;
      } else {
        await prisma.retailStore.create({
          data: {
            storeName: s.name,
            region,
            isActive: s.isActive,
          },
        });
        created += 1;
      }
    }

    const activeStoreCount = await prisma.retailStore.count({
      where: { isActive: true },
    });

    return NextResponse.json({
      ok: true,
      synced: stores.length,
      created,
      updated,
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
