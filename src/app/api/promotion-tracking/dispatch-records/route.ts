import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { employeeId, workDate, toStoreId, actualHours, remark } = body;

  if (!employeeId || !workDate || !toStoreId || actualHours === undefined) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  // Infer fromStoreId from most frequent dispatch source (home store)
  const homeRows = await prisma.$queryRaw<{ fromStoreId: string }[]>`
    SELECT d."fromStoreId"
    FROM "DispatchRecord" d
    WHERE d."employeeId" = ${employeeId}
      AND d."fromStoreId" IS NOT NULL
    GROUP BY d."fromStoreId"
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `;
  const fromStoreId = homeRows[0]?.fromStoreId ?? null;

  const record = await prisma.dispatchRecord.create({
    data: {
      employeeId,
      workDate: new Date(workDate),
      fromStoreId,
      toStoreId,
      dispatchHours: Number(actualHours),
      actualHours: Number(actualHours),
      confirmStatus: "已確認",
      remark: remark || null,
      createdBy: "manual",
    },
  });

  return NextResponse.json({ ok: true, id: record.id });
}
