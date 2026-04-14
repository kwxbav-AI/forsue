import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STORES } from "@/../prisma/stores.data";

export const dynamic = "force-dynamic";

/**
 * 將預設門市清單寫入資料庫（可重複執行，會 upsert）
 * 用途：避免 seed 在 Windows 被鎖檔時無法執行
 */
export async function POST() {
  try {
    for (const s of STORES) {
      const store = await prisma.store.upsert({
        where: { name: s.name },
        update: {},
        create: { name: s.name },
      });
      for (const code of s.codes) {
        await prisma.storeAlias.upsert({
          where: { code },
          update: { storeId: store.id },
          create: { code, storeId: store.id },
        });
      }
    }
    return NextResponse.json({ success: true, count: STORES.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "匯入失敗" },
      { status: 500 }
    );
  }
}

