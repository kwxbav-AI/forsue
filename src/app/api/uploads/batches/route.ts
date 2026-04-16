import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 取得各檔案類型最近一筆上傳紀錄 */
export async function GET() {
  const types = ["ATTENDANCE", "DISPATCH", "EMPLOYEE_MASTER", "DAILY_REVENUE", "INVENTORY_REFERENCE"] as const;
  const results = await Promise.all(
    types.map(async (fileType) => {
      const batch = await prisma.uploadBatch.findFirst({
        where: { fileType, status: "SUCCESS" },
        orderBy: { uploadedAt: "desc" },
      });
      return { fileType, batch };
    })
  );
  const map: Record<string, { uploadedAt: string; originalName: string; recordCount: number } | null> = {};
  results.forEach(({ fileType, batch }) => {
    map[fileType] = batch
      ? {
          uploadedAt: batch.uploadedAt.toISOString(),
          originalName: batch.originalName,
          recordCount: batch.recordCount,
        }
      : null;
  });
  return NextResponse.json(map);
}
