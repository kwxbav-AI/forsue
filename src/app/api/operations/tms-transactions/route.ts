import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { serializeTmsTransaction } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1),
  transactionTime: z.string(),
  orderNo: z.string().min(1),
  amount: z.number(),
  createdBy: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get("storeId") ?? undefined;
  const list = await prisma.tmsTransaction.findMany({
    where: storeId ? { storeId } : undefined,
    include: { store: { select: { storeName: true } } },
    orderBy: { transactionTime: "desc" },
    take: 200,
  });
  return NextResponse.json(list.map(serializeTmsTransaction));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const created = await prisma.tmsTransaction.create({
      data: {
        storeId: d.storeId,
        transactionTime: new Date(d.transactionTime),
        orderNo: d.orderNo.trim(),
        amount: d.amount,
        createdBy: d.createdBy?.trim() || null,
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeTmsTransaction(created), { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "新增 TMS 紀錄失敗" },
      { status: 500 }
    );
  }
}
