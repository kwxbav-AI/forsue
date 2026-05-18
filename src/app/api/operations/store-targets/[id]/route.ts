import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { computeRplhTarget } from "@/lib/operations";
import { serializeStoreTarget } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeId: z.string().min(1).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  salesTarget: z.number().positive().optional(),
  laborHourTarget: z.number().positive().optional(),
  note: z.string().optional().nullable(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const existing = await prisma.storeTarget.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "找不到目標設定" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "欄位錯誤", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const salesTarget =
      parsed.data.salesTarget !== undefined
        ? parsed.data.salesTarget
        : Number(existing.salesTarget);
    const laborHourTarget =
      parsed.data.laborHourTarget !== undefined
        ? parsed.data.laborHourTarget
        : Number(existing.laborHourTarget);
    const rplh = computeRplhTarget(salesTarget, laborHourTarget);

    const updated = await prisma.storeTarget.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.storeId !== undefined ? { storeId: parsed.data.storeId } : {}),
        ...(parsed.data.year !== undefined ? { year: parsed.data.year } : {}),
        ...(parsed.data.month !== undefined ? { month: parsed.data.month } : {}),
        ...(parsed.data.salesTarget !== undefined
          ? { salesTarget: parsed.data.salesTarget }
          : {}),
        ...(parsed.data.laborHourTarget !== undefined
          ? { laborHourTarget: parsed.data.laborHourTarget }
          : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note?.trim() || null } : {}),
        rplhTarget: rplh,
      },
      include: { store: { select: { storeName: true, region: true } } },
    });
    return NextResponse.json(serializeStoreTarget(updated));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "更新目標失敗";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json(
        { error: "此門市在該年月已有目標設定" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.storeTarget.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "刪除目標失敗";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "找不到目標設定" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
