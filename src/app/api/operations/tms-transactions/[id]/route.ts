import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { serializeTmsTransaction } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1).optional(),
  transactionTime: z.string().optional(),
  orderNo: z.string().min(1).optional(),
  amount: z.number().optional(),
  createdBy: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const updated = await prisma.tmsTransaction.update({
      where: { id: params.id },
      data: {
        ...(d.storeId !== undefined ? { storeId: d.storeId } : {}),
        ...(d.transactionTime !== undefined
          ? { transactionTime: new Date(d.transactionTime) }
          : {}),
        ...(d.orderNo !== undefined ? { orderNo: d.orderNo.trim() } : {}),
        ...(d.amount !== undefined ? { amount: d.amount } : {}),
        ...(d.createdBy !== undefined ? { createdBy: d.createdBy?.trim() || null } : {}),
      },
      include: { store: { select: { storeName: true } } },
    });
    return NextResponse.json(serializeTmsTransaction(updated));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "更新 TMS 紀錄失敗";
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "找不到紀錄" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.tmsTransaction.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "刪除 TMS 紀錄失敗";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "找不到紀錄" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
