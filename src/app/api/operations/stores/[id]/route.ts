import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { serializeRetailStore } from "@/lib/operations-serialize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  storeName: z.string().min(1).optional(),
  region: z.string().optional().nullable(),
  managerName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const item = await prisma.retailStore.findUnique({ where: { id: params.id } });
  if (!item) {
    return NextResponse.json({ error: "找不到門市" }, { status: 404 });
  }
  return NextResponse.json(serializeRetailStore(item));
}

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
    const data: {
      storeName?: string;
      region?: string | null;
      managerName?: string | null;
      isActive?: boolean;
    } = {};
    if (parsed.data.storeName !== undefined) data.storeName = parsed.data.storeName.trim();
    if (parsed.data.region !== undefined) data.region = parsed.data.region?.trim() || null;
    if (parsed.data.managerName !== undefined) {
      data.managerName = parsed.data.managerName?.trim() || null;
    }
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

    const updated = await prisma.retailStore.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(serializeRetailStore(updated));
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "更新門市失敗";
    if (msg.includes("Record to update not found")) {
      return NextResponse.json({ error: "找不到門市" }, { status: 404 });
    }
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "門市名稱已存在" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.retailStore.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "刪除門市失敗";
    if (msg.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "找不到門市" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
